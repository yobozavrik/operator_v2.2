"""
run.py — AutoResearch Loop Runner
==================================
Like Karpathy's autoresearch but using Gemini as the agent.

Improvements from Karpathy's PRs:
  #331 — results.json written after each run (structured, not stdout)
  #336 — agent accumulates hypotheses, fed back on stagnation
  #343 — preflight checks before running experiment

2026-03-22: Relaxed STRICT CONSTRAINTS — agent can now compute new columns
in extra_features() using existing data with shift >= 1.

Usage:
  cd autoresearch
  python run.py --max 50
  python run.py --max 20 --model flash
  python run.py --max 20 --model pro3
"""

import os
import sys
import json
import shutil
import argparse
import importlib
import traceback
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

# ── Load .env.local ────────────────────────────────────────────────────────────
env_file = ROOT / ".env.local"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-3-flash-preview"

TRAIN_FILE    = HERE / "train.py"
PROGRAM_FILE  = HERE / "program.md"
HISTORY_FILE  = HERE / "loop_history.json"
BACKUP_FILE   = HERE / "train.py.bak"
RESULTS_FILE  = HERE / "results.json"   # PR #331

STAGNATION_LIMIT = 3   # PR #327 — switch experiment type after N no-improve


# ── History ────────────────────────────────────────────────────────────────────
def load_history() -> list:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, encoding="utf-8-sig") as f:
            return json.load(f)
    return []


def save_history(history: list):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def history_summary(history: list, n: int = 20) -> str:
    if not history:
        return "No experiments yet."
    lines = []
    for h in history[-n:]:
        status   = "KEEP" if h.get("kept") else "REVERT"
        wape_str = f"{h['wape']:.4f}" if h.get("wape") is not None else "ERROR"
        hypo     = f"  [hypo: {h['hypothesis'][:60]}]" if h.get("hypothesis") else ""
        lines.append(f"[{status}] wape={wape_str}  {h.get('change_summary','?')[:70]}{hypo}")
    return "\n".join(lines)


# PR #336 — collect unique hypotheses from history
def collect_hypotheses(history: list, limit: int = 8) -> str:
    seen, result = set(), []
    for h in reversed(history):
        hypo = h.get("hypothesis", "").strip()
        if hypo and hypo not in seen:
            seen.add(hypo)
            result.append(f"  - {hypo}")
        if len(result) >= limit:
            break
    return "\n".join(result) if result else ""


# ── Gemini call ─────────────────────────────────────────────────────────────────
def call_gemini(system_prompt: str, user_prompt: str) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(system_instruction=system_prompt),
    )
    return response.text.strip()


def clean_python(text: str) -> str:
    """Strip markdown code fences if present."""
    if "```python" in text:
        s = text.index("```python") + len("```python")
        e = text.rindex("```")
        return text[s:e].strip()
    if text.count("```") >= 2:
        s = text.index("```") + 3
        e = text.rindex("```")
        return text[s:e].strip()
    return text.strip()


# PR #336 — extract hypothesis comment from agent code
def extract_hypothesis(code: str) -> str:
    for line in code.splitlines():
        if "NEXT_HYPOTHESIS:" in line:
            return line.split("NEXT_HYPOTHESIS:", 1)[1].strip().strip("#").strip()
    return ""


# ── Module reload ───────────────────────────────────────────────────────────────
EVAL_DATE_OVERRIDE: str | None = None


def reload_train():
    for k in list(sys.modules):
        if k in ("train", "prepare"):
            del sys.modules[k]
    return importlib.import_module("train")


def reload_prepare():
    for k in list(sys.modules):
        if k == "prepare":
            del sys.modules[k]
    p = importlib.import_module("prepare")
    if EVAL_DATE_OVERRIDE:
        p.set_eval_date(EVAL_DATE_OVERRIDE)
    return p


# ── PR #343: Preflight checks ───────────────────────────────────────────────────
def preflight_check(train_module) -> str | None:
    """
    Validates train.py config before running expensive experiment.
    Returns error string or None if OK.
    """
    features = getattr(train_module, "FEATURES", None)
    if not isinstance(features, list) or len(features) == 0:
        return "PRECHECK_FAIL: FEATURES must be a non-empty list"

    params = getattr(train_module, "PARAMS", {})
    required = {"n_estimators", "learning_rate", "num_leaves"}
    missing_p = required - set(params.keys())
    if missing_p:
        return f"PRECHECK_FAIL: PARAMS missing keys: {missing_p}"

    n_est = params.get("n_estimators", 0)
    if not isinstance(n_est, int) or n_est < 50 or n_est > 5000:
        return f"PRECHECK_FAIL: n_estimators={n_est} out of range [50, 5000]"

    if not callable(getattr(train_module, "extra_features", None)):
        return "PRECHECK_FAIL: extra_features() is not callable"

    return None


# ── Main loop ───────────────────────────────────────────────────────────────────
def run(max_experiments: int = 9999):
    if RESULTS_FILE.exists():
        RESULTS_FILE.unlink()

    prepare0 = reload_prepare()
    print(f"AutoResearch | model={GEMINI_MODEL} | max={max_experiments}")
    print(f"Test window: {prepare0.EVAL_TEST_START.date()} to {prepare0.EVAL_LAST_DATE.date()}  |  target: demand_d0_d1")
    print("=" * 60)

    history   = load_history()
    kept_list = [h for h in history if h.get("kept") and h.get("wape") is not None]
    best_wape = min((h["wape"] for h in kept_list), default=9999.0)

    system_prompt = PROGRAM_FILE.read_text(encoding="utf-8")

    # ── Baseline (first run) ─────────────────────────────────────────────────────
    if not history:
        print("[baseline] Running with current train.py ...")
        prepare = reload_prepare()
        train   = reload_train()
        try:
            result = prepare.run_experiment(train)
        except Exception:
            traceback.print_exc()
            sys.exit(1)
        best_wape = result["wape"]
        entry = {
            "experiment":      0,
            "wape":            result["wape"],
            "wape_by_dow":     result["wape_by_dow"],
            "top_features":    result.get("top_features", {}),
            "bottom_features": result.get("bottom_features", {}),
            "kept":            True,
            "change_summary":  "baseline",
            "hypothesis":      "",
            "timestamp":       datetime.now().isoformat(),
        }
        history.append(entry)
        save_history(history)
        RESULTS_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  Baseline WAPE: {best_wape:.4f}")
        print(f"  By DOW: {result['wape_by_dow']}")

    # ── Experiment loop ──────────────────────────────────────────────────────────
    stagnation = 0
    kept_count = sum(1 for h in history if h.get("kept"))

    for exp in range(1, max_experiments + 1):
        print(f"\n[{exp}/{max_experiments}]  best WAPE so far: {best_wape:.4f}")

        current_code = TRAIN_FILE.read_text(encoding="utf-8")
        hist_text    = history_summary(history)

        last_kept = next((h for h in reversed(history) if h.get("kept") and h.get("top_features")), None)
        imp_block = ""
        if last_kept:
            imp_block = (
                f"\nLast experiment feature importances:\n"
                f"  TOP (most used):    {last_kept['top_features']}\n"
                f"  BOTTOM (least used): {last_kept['bottom_features']}\n"
            )

        stag_block = ""
        if stagnation >= STAGNATION_LIMIT:
            stag_block = (
                f"\n[STAGNATION ALERT: {stagnation} experiments without improvement]"
                f"\nSwitch experiment TYPE: if you were tuning params -> change features."
                f"\nIf adding features -> try removing low-importance ones."
                f"\nIf modifying extra_features -> try a completely different approach.\n"
            )

        hypotheses = collect_hypotheses(history)
        hypo_block = ""
        if hypotheses:
            hypo_block = f"\nAccumulated hypotheses (ideas not yet fully explored):\n{hypotheses}\n"

        user_msg = (
            f"Current best WAPE: {best_wape:.4f}\n"
            f"{imp_block}"
            f"{stag_block}"
            f"{hypo_block}"
            f"\nExperiment history (last 20):\n{hist_text}\n"
            f"\nCurrent train.py:\n```python\n{current_code}\n```\n\n"
            f"Propose ONE improvement. "
            f"CONSTRAINTS:\n"
            f"  1. You may modify: FEATURES list, PARAMS dict, or extra_features() function.\n"
            f"  2. In extra_features(), you MAY (and should!) compute new columns from existing df columns.\n"
            f"     Feel free to invent new complex aggregations, window ratios, rolling differences, etc.\n"
            f"     CRITICAL: ONLY use past data. Any shift/rolling must use shift >= 1.\n"
            f"     Never use demand_qty, fresh_sold, supply_qty, disc_sold at shift=0.\n"
            f"     Do not attempt to modify prepare.py or any files outside train.py.\n"
            f"  3. Any new column computed in extra_features() MUST be added to FEATURES.\n"
            f"  4. ASCII only, valid Python only, no markdown, no explanations outside comments.\n"
            f"  5. Do NOT degrade Mon/Sun performance just to improve Sat. Multi-objective improvement is desired.\n"
            f"At the end of train.py add a comment: # NEXT_HYPOTHESIS: <your idea for future experiments>\n"
            f"Return ONLY the complete new train.py."
        )

        print("  -> Calling Gemini...", end=" ", flush=True)
        try:
            response = call_gemini(system_prompt, user_msg)
            new_code = clean_python(response)
            print("OK")
        except Exception as e:
            print(f"ERROR: {e}")
            import time; time.sleep(15)
            continue

        hypothesis = extract_hypothesis(new_code)

        new_lines     = set(new_code.splitlines())
        current_lines = set(current_code.splitlines())
        added   = [l.strip() for l in new_lines - current_lines if l.strip()]
        removed = [l.strip() for l in current_lines - new_lines if l.strip()]
        change_summary = (
            ("+" + " | +".join(added[:2]))[:60] +
            (" | -" + " | -".join(removed[:1]))[:30]
        ).strip("| ")
        print(f"  change: {change_summary}")

        shutil.copy(TRAIN_FILE, BACKUP_FILE)
        TRAIN_FILE.write_text(new_code, encoding="utf-8")

        try:
            compile(new_code, "train.py", "exec")
        except SyntaxError as e:
            print(f"  REVERT [-]  syntax error: {e}")
            shutil.copy(BACKUP_FILE, TRAIN_FILE)
            history.append({
                "experiment": exp, "wape": None, "kept": False,
                "hypothesis": hypothesis,
                "change_summary": f"SYNTAX ERROR: {change_summary}",
                "timestamp": datetime.now().isoformat(),
            })
            save_history(history)
            stagnation += 1
            continue

        try:
            train_mod = reload_train()
            preflight_err = preflight_check(train_mod)
        except Exception as e:
            preflight_err = f"PRECHECK_FAIL: import error: {e}"

        if preflight_err:
            print(f"  REVERT [-]  {preflight_err}")
            shutil.copy(BACKUP_FILE, TRAIN_FILE)
            history.append({
                "experiment": exp, "wape": None, "kept": False,
                "hypothesis": hypothesis,
                "change_summary": f"{preflight_err}: {change_summary}",
                "timestamp": datetime.now().isoformat(),
            })
            save_history(history)
            stagnation += 1
            continue

        result = None
        try:
            prepare = reload_prepare()
            train   = reload_train()
            result  = prepare.run_experiment(train)
            RESULTS_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"  ERROR: {e}")

        BIAS_GUARD_LOW, BIAS_GUARD_HIGH = -0.20, 0.20
        bias_val  = result.get("bias", 0) if result else 0
        bias_fail = (bias_val < BIAS_GUARD_LOW) or (bias_val > BIAS_GUARD_HIGH)

        wape_improved = result is not None and result["wape"] < best_wape
        wape_b_str = f"  EvalB={result['wape_all']:.4f}/Bias_B={result['bias_all']:.3f}" if result and "wape_all" in result else ""

        if wape_improved and not bias_fail:
            best_wape  = result["wape"]
            kept_flag  = True
            stagnation = 0
            kept_count += 1
            print(f"  KEEP [+]  WAPE={result['wape']:.4f}  Bias={bias_val:.3f}{wape_b_str}  <- new best!")
            print(f"          DOW:    {result['wape_by_dow']}")
            print(f"          TOP:    {result.get('top_features', {})}")
            print(f"          BOTTOM: {result.get('bottom_features', {})}")
        else:
            kept_flag  = False
            stagnation += 1
            wape_str   = f"{result['wape']:.4f}" if result else "ERROR"
            reason = f"bias_guard(bias={bias_val:.3f} out of [{BIAS_GUARD_LOW}, {BIAS_GUARD_HIGH}])" if bias_fail else f"best={best_wape:.4f}"
            print(f"  REVERT [-]  WAPE={wape_str}  Bias={bias_val:.3f}{wape_b_str}  ({reason})")
            if result:
                print(f"          TOP:    {result.get('top_features', {})}")
                print(f"          BOTTOM: {result.get('bottom_features', {})}")
            shutil.copy(BACKUP_FILE, TRAIN_FILE)

        history.append({
            "experiment":      exp,
            "wape":            result["wape"] if result else None,
            "wape_by_dow":     result.get("wape_by_dow") if result else None,
            "top_features":    result.get("top_features") if result else None,
            "bottom_features": result.get("bottom_features") if result else None,
            "kept":            kept_flag,
            "hypothesis":      hypothesis,
            "change_summary":  change_summary,
            "timestamp":       datetime.now().isoformat(),
            "agent_code":      new_code if kept_flag else None,
        })
        save_history(history)

    print(f"\nFinished. Best WAPE: {best_wape:.4f}  |  kept {kept_count}/{max_experiments} experiments")


# ── Entry point ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max", type=int, default=9999)
    parser.add_argument("--model", type=str, default=None,
                        help="flash | pro3 | pro | full model ID")
    parser.add_argument("--date", type=str, default=None,
                        help="Test window end date, e.g. 2026-03-18")
    args = parser.parse_args()

    if args.model:
        aliases = {
            "flash":      "gemini-3-flash-preview",
            "flash31":    "gemini-3.1-flash-lite-preview",
            "pro3":       "gemini-3-pro-preview",
            "pro":        "gemini-3.1-pro-preview",
        }
        GEMINI_MODEL = aliases.get(args.model, args.model)

    if args.date:
        EVAL_DATE_OVERRIDE = args.date
        import prepare as _p
        _p.set_eval_date(args.date)

    run(max_experiments=args.max)
