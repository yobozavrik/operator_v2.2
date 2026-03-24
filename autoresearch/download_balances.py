"""
download_balances.py — Завантажує всі Excel-залишки з Gmail
============================================================
Перед запуском:
  1. Gmail → Settings → Enable IMAP
  2. Google Account → Security → App Passwords → створи пароль для Mail
  3. Заповни EMAIL, APP_PASSWORD, SUBJECT_FILTER нижче

Запуск:
  python download_balances.py
"""

import imaplib
import email
import os
import re
from pathlib import Path
from datetime import datetime

# ── Налаштування ──────────────────────────────────────────────────────
EMAIL         = "gala.baluvana.bukovina@gmail.com"         # ← твій Gmail (куди приходять листи)
APP_PASSWORD  = "xxxx xxxx xxxx xxxx"                    # ← App Password (16 символів)
SUBJECT_FILTER = ""                                       # ← тема порожня, фільтруємо по відправнику
SENDER_FILTER  = "pizza.galabaluvana.bukovina@gmail.com" # ← відправник
DATE_FROM      = "01-Sep-2025"                            # ← з якої дати шукати
OUTPUT_DIR     = Path("D:/operator-main/autoresearch/balance_exports")

OUTPUT_DIR.mkdir(exist_ok=True)

# ── Підключення до Gmail ──────────────────────────────────────────────
print("Підключення до Gmail IMAP...")
mail = imaplib.IMAP4_SSL("imap.gmail.com")
mail.login(EMAIL, APP_PASSWORD)
mail.select("inbox")

# ── Пошук листів ─────────────────────────────────────────────────────
search_criteria = f'(SINCE "{DATE_FROM}")'
if SENDER_FILTER:
    search_criteria = f'(SINCE "{DATE_FROM}" FROM "{SENDER_FILTER}")'

_, msg_ids = mail.search(None, search_criteria)
all_ids = msg_ids[0].split()
print(f"Знайдено листів: {len(all_ids)}")

downloaded = 0
skipped    = 0

for msg_id in all_ids:
    _, msg_data = mail.fetch(msg_id, "(RFC822)")
    msg = email.message_from_bytes(msg_data[0][1])

    subject = email.header.decode_header(msg["Subject"] or "")[0]
    subject = subject[0].decode(subject[1] or "utf-8") if isinstance(subject[0], bytes) else subject[0]

    # Фільтр по темі
    if SUBJECT_FILTER and SUBJECT_FILTER.lower() not in subject.lower():
        continue

    # Дата листа
    date_str = msg["Date"]
    try:
        msg_date = email.utils.parsedate_to_datetime(date_str)
        date_label = msg_date.strftime("%Y%m%d")
    except Exception:
        date_label = "unknown"

    # Шукаємо xlsx вкладення
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get("Content-Disposition") is None:
            continue

        filename = part.get_filename()
        if not filename:
            continue

        # Декодуємо ім'я файлу якщо потрібно
        decoded = email.header.decode_header(filename)[0]
        filename = decoded[0].decode(decoded[1] or "utf-8") if isinstance(decoded[0], bytes) else decoded[0]

        if not filename.lower().endswith(".xlsx"):
            continue

        # Зберігаємо з датою в назві
        out_name = f"{date_label}_{filename}"
        out_path = OUTPUT_DIR / out_name

        if out_path.exists():
            skipped += 1
            continue

        payload = part.get_payload(decode=True)
        out_path.write_bytes(payload)
        downloaded += 1
        print(f"  [{date_label}] {filename} → {out_name}")

mail.logout()
print(f"\nГотово: завантажено {downloaded}, пропущено {skipped} (вже існують)")
print(f"Файли збережено в: {OUTPUT_DIR}")
