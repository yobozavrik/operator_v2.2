"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  Clock3,
  CopyPlus,
  Download,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { authedFetcher } from "@/lib/authed-fetcher";
import { generateDistributionExcel } from "@/lib/order-export";

interface DistributionResult {
  product_name: string;
  spot_name: string;
  quantity_to_ship: number;
  calc_time: string;
}

interface ProductionItem {
  product_name: string;
  baked_at_factory: number;
}

type ReservationStatus = "draft" | "confirmed" | "used_in_distribution" | "superseded";

interface ReservationItem {
  id?: string;
  sku: string;
  qty: number;
}

interface ReservationRecord {
  id: string;
  reservation_date: string;
  customer_name: string;
  status: ReservationStatus;
  previous_reservation_id: string | null;
  version_no: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  customer_reservation_items: ReservationItem[];
}

interface ReservationDraft {
  id: string | null;
  customerName: string;
  items: ReservationItem[];
}

const fetcher = authedFetcher;
const DEFAULT_CUSTOMER_NAME = "Замовник Галя Балувана";

function getLocalIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localNow = new Date(now.getTime() - offset * 60_000);
  return localNow.toISOString().slice(0, 10);
}

function createEmptyDraft(): ReservationDraft {
  return { id: null, customerName: DEFAULT_CUSTOMER_NAME, items: [{ sku: "", qty: 1 }] };
}

function getStatusMeta(status: ReservationStatus) {
  switch (status) {
    case "draft":
      return { label: "чернетка", className: "border-slate-300 bg-slate-100 text-slate-600" };
    case "confirmed":
      return { label: "підтверджено", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" };
    case "used_in_distribution":
      return { label: "використано", className: "border-orange-500/30 bg-orange-500/10 text-orange-400" };
    default:
      return { label: "замінено", className: "border-slate-300 bg-slate-100 text-slate-500" };
  }
}

export const DistributionControlPanel = () => {
  const [selectedDate, setSelectedDate] = useState(getLocalIsoDate);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingReservation, setIsSavingReservation] = useState(false);
  const [isConfirmingReservation, setIsConfirmingReservation] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReservationDraft>(createEmptyDraft);

  const { data: resultsData, isLoading: resultsLoading, mutate: refreshResults } = useSWR<DistributionResult[]>(
    "/api/pizza/distribution/results",
    fetcher,
    { refreshInterval: 10000 }
  );
  const { data: productionData } = useSWR<ProductionItem[]>("/api/pizza/production-detail", fetcher);
  const {
    data: reservationsData,
    isLoading: reservationsLoading,
    mutate: refreshReservations,
  } = useSWR<ReservationRecord[]>(`/api/pizza/reservations?date=${selectedDate}`, fetcher);

  useEffect(() => {
    const currentDraft = reservationsData?.find((reservation) => reservation.status === "draft");
    if (!currentDraft) {
      setDraft(createEmptyDraft());
      return;
    }
    setDraft({
      id: currentDraft.id,
      customerName: currentDraft.customer_name,
      items: currentDraft.customer_reservation_items.length
        ? currentDraft.customer_reservation_items.map((item) => ({ id: item.id, sku: item.sku, qty: Number(item.qty) }))
        : [{ sku: "", qty: 1 }],
    });
  }, [reservationsData]);

  const nonDraftReservations = useMemo(
    () => (reservationsData || []).filter((reservation) => reservation.status !== "draft"),
    [reservationsData]
  );
  const latestConfirmedReservation = useMemo(
    () => (reservationsData || []).find((reservation) => reservation.status === "confirmed") || null,
    [reservationsData]
  );
  const latestActiveReservation = useMemo(
    () => (reservationsData || []).find((reservation) => ["confirmed", "used_in_distribution"].includes(reservation.status)) || null,
    [reservationsData]
  );
  const productOptions = useMemo(
    () => Array.from(new Set((productionData || []).map((item) => item.product_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [productionData]
  );

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.clearTimeout((showFeedback as typeof showFeedback & { timer?: number }).timer);
    (showFeedback as typeof showFeedback & { timer?: number }).timer = window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleExport = async () => {
    if (!resultsData?.length) return;
    setIsExporting(true);
    try {
      await generateDistributionExcel(resultsData, "ЦЕХ Піца");
      showFeedback("Excel експортовано");
    } catch (error) {
      console.error("Export failed:", error);
      showFeedback(error instanceof Error ? error.message : "Помилка експорту Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRunDistribution = async () => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/pizza/distribution/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка запуску розподілу");

      // Правило 5: статус резерву confirmed → used_in_distribution
      // змінюється в момент успішного запуску розподілу, а не при експорті Excel
      if (latestConfirmedReservation) {
        const markRes = await fetch(`/api/pizza/reservations/${latestConfirmedReservation.id}/mark-used`, { method: "POST" });
        const markJson = await markRes.json();
        if (!markRes.ok) {
          console.error("mark-used failed:", markJson.error);
        } else {
          await refreshReservations();
        }
      }

      showFeedback(json.message || "Розподіл виконано");
      await refreshResults();
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Помилка запуску розподілу");
    } finally {
      setIsRunning(false);
    }
  };

  const handleAddDraftRow = () => setDraft((current) => ({ ...current, items: [...current.items, { sku: "", qty: 1 }] }));
  const handleRemoveDraftRow = (index: number) => setDraft((current) => ({
    ...current,
    items: current.items.filter((_, itemIndex) => itemIndex !== index).length
      ? current.items.filter((_, itemIndex) => itemIndex !== index)
      : [{ sku: "", qty: 1 }],
  }));

  const handleDraftItemChange = (index: number, field: keyof ReservationItem, value: string | number) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: field === "qty" ? Math.max(1, Number(value) || 1) : String(value) }
          : item
      ),
    }));
  };

  const buildReservationPayload = () => {
    const items = draft.items
      .map((item) => ({ sku: item.sku.trim(), qty: Math.trunc(Number(item.qty) || 0) }))
      .filter((item) => item.sku && item.qty > 0);
    if (!draft.customerName.trim()) throw new Error("Потрібно вказати замовника");
    return { id: draft.id || undefined, reservationDate: selectedDate, customerName: draft.customerName.trim(), items };
  };

  const saveReservation = async () => {
    const payload = buildReservationPayload();
    setIsSavingReservation(true);
    try {
      const res = await fetch("/api/pizza/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Не вдалося зберегти чернетку");
      await refreshReservations();
      showFeedback("Чернетку збережено");
      return String(json.id);
    } finally {
      setIsSavingReservation(false);
    }
  };

  const handleSaveReservation = async () => {
    try {
      await saveReservation();
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Не вдалося зберегти чернетку");
    }
  };

  const handleConfirmReservation = async () => {
    setIsConfirmingReservation(true);
    try {
      const reservationId = await saveReservation();
      const res = await fetch(`/api/pizza/reservations/${reservationId}/confirm`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Не вдалося підтвердити резерв");
      await refreshReservations();
      showFeedback("Резерв підтверджено");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Не вдалося підтвердити резерв");
    } finally {
      setIsConfirmingReservation(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!latestActiveReservation) return;
    setIsCreatingVersion(true);
    try {
      const res = await fetch(`/api/pizza/reservations/${latestActiveReservation.id}/create-version`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Не вдалося створити нову версію");
      await refreshReservations();
      showFeedback(json.reused ? "Відкрито існуючу чернетку" : "Створено нову версію");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Не вдалося створити нову версію");
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const canEditDraft = Boolean(draft.id || !latestActiveReservation);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-primary font-sans text-text-primary">
      <div className="shrink-0 p-4 pb-2 lg:p-6 lg:pb-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-panel-border bg-panel-bg p-4 shadow-[var(--panel-shadow)]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                <Truck size={24} className="text-orange-500" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-chakra)] text-xl font-bold uppercase tracking-wide">Панель логіста</h2>
                <div className="mt-1 font-[family-name:var(--font-jetbrains)] text-[10px] font-black uppercase tracking-widest text-text-secondary">Резерв для замовника по піці</div>
              </div>
            </div>
            <div className="flex w-full flex-col items-end gap-2 md:w-auto">
              <div className="flex w-full items-center gap-3 md:w-auto">
                <button onClick={handleExport} disabled={isExporting || resultsLoading || !resultsData?.length} className={cn("flex h-12 shrink-0 items-center gap-2 rounded-xl border px-6 font-bold uppercase tracking-wider transition-all", !resultsData?.length ? "cursor-not-allowed border-panel-border bg-bg-primary text-text-muted" : "border-[#00E0FF]/30 bg-panel-bg text-[#00E0FF] hover:border-[#00E0FF]/60 hover:bg-[#00E0FF]/10")}>{isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}<span className="hidden text-xs tracking-widest sm:inline">Excel</span></button>
                <button onClick={handleRunDistribution} disabled={isRunning} className={cn("flex h-12 w-full items-center justify-center gap-3 rounded-xl border px-8 font-black uppercase tracking-wider text-white transition-all md:w-auto", isRunning ? "cursor-not-allowed border-panel-border bg-bg-primary text-text-muted" : "border-orange-400/50 bg-orange-500 hover:bg-orange-400")}>{isRunning ? <><Loader2 size={20} className="animate-spin text-text-muted" /><span className="text-text-muted">Розрахунок...</span></> : <><Play size={20} fill="currentColor" /><span>Сформувати розподіл</span></>}</button>
              </div>
              <AnimatePresence>{feedback && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 font-[family-name:var(--font-jetbrains)] text-xs font-medium text-emerald-400"><CheckCircle2 size={14} />{feedback}</motion.div>}</AnimatePresence>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="rounded-2xl border border-panel-border bg-bg-primary/60 p-4">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div><div className="font-[family-name:var(--font-chakra)] text-sm font-bold uppercase tracking-wide">Відкласти замовнику</div><div className="font-[family-name:var(--font-jetbrains)] text-[10px] uppercase tracking-widest text-text-secondary">Чернетка, підтвердження та версії резерву</div></div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-text-secondary">Дата<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-lg border border-panel-border bg-panel-bg px-3 text-sm text-text-primary outline-none" /></label>
                  <label className="flex min-w-[240px] flex-col gap-1 text-xs uppercase tracking-wider text-text-secondary">Замовник<input type="text" value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} disabled={!canEditDraft} className="h-10 rounded-lg border border-panel-border bg-panel-bg px-3 text-sm text-text-primary outline-none disabled:cursor-not-allowed disabled:text-text-muted" /></label>
                </div>
              </div>
              {canEditDraft ? (
                <>
                  <div className="space-y-3">
                    {draft.items.map((item, index) => (
                      <div key={`${draft.id ?? 'draft'}-${index}`} className="grid gap-3 rounded-xl border border-panel-border bg-panel-bg p-3 md:grid-cols-[minmax(0,1fr)_120px_48px]">
                        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-text-secondary">SKU<input list="pizza-reservation-skus" value={item.sku} onChange={(event) => handleDraftItemChange(index, 'sku', event.target.value)} placeholder="Оберіть або введіть назву піци" className="h-10 rounded-lg border border-panel-border bg-bg-primary px-3 text-sm text-text-primary outline-none" /></label>
                        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-text-secondary">К-сть<input type="number" min={1} value={item.qty} onChange={(event) => handleDraftItemChange(index, 'qty', event.target.value)} className="h-10 rounded-lg border border-panel-border bg-bg-primary px-3 text-sm text-text-primary outline-none" /></label>
                        <button type="button" onClick={() => handleRemoveDraftRow(index)} className="mt-auto flex h-10 items-center justify-center rounded-lg border border-panel-border bg-bg-primary text-text-secondary transition-colors hover:border-red-400/40 hover:text-red-400" title="Видалити рядок"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <datalist id="pizza-reservation-skus">{productOptions.map((productName) => <option key={productName} value={productName} />)}</datalist>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <button type="button" onClick={handleAddDraftRow} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-4 text-sm font-semibold text-text-primary transition-colors hover:border-orange-400/40 hover:text-orange-400"><Plus size={16} />Додати рядок</button>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button type="button" onClick={handleSaveReservation} disabled={isSavingReservation || isConfirmingReservation} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-4 text-sm font-semibold text-text-primary transition-colors hover:border-[#00E0FF]/40 hover:text-[#00E0FF] disabled:cursor-not-allowed disabled:text-text-muted">{isSavingReservation ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Зберегти чернетку</button>
                      <button type="button" onClick={handleConfirmReservation} disabled={isSavingReservation || isConfirmingReservation} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:text-text-muted">{isConfirmingReservation ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Підтвердити резерв</button>
                    </div>
                  </div>
                </>
              ) : latestActiveReservation ? (
                <div className="rounded-xl border border-panel-border bg-panel-bg p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><Clock3 size={16} className="text-orange-400" /><span className="text-sm font-semibold text-text-primary">Актуальний резерв версії #{latestActiveReservation.version_no}</span><span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest", getStatusMeta(latestActiveReservation.status).className)}>{getStatusMeta(latestActiveReservation.status).label}</span></div>
                      <div className="text-sm text-text-secondary">{latestActiveReservation.customer_name}</div>
                      <div className="space-y-2 pt-2">{latestActiveReservation.customer_reservation_items.map((item) => <div key={item.id || `${latestActiveReservation.id}-${item.sku}`} className="flex items-center justify-between rounded-lg border border-panel-border bg-bg-primary px-3 py-2 text-sm"><span className="text-text-primary">{item.sku}</span><span className="font-[family-name:var(--font-jetbrains)] font-bold text-orange-400">{item.qty}</span></div>)}</div>
                    </div>
                    <button type="button" onClick={handleCreateVersion} disabled={isCreatingVersion} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-4 text-sm font-semibold text-text-primary transition-colors hover:border-orange-400/40 hover:text-orange-400 disabled:cursor-not-allowed disabled:text-text-muted">{isCreatingVersion ? <Loader2 size={16} className="animate-spin" /> : <CopyPlus size={16} />}Створити нову версію</button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-panel-border bg-bg-primary/60 p-4">
              <div className="mb-3 flex items-center justify-between"><div><div className="font-[family-name:var(--font-chakra)] text-sm font-bold uppercase tracking-wide">Історія резервів</div><div className="font-[family-name:var(--font-jetbrains)] text-[10px] uppercase tracking-widest text-text-secondary">Підтверджені та використані версії на обрану дату</div></div><button type="button" onClick={() => refreshReservations()} className="rounded-lg border border-panel-border p-2 text-text-secondary transition-colors hover:border-[#00E0FF]/40 hover:text-[#00E0FF]" title="Оновити резерви"><RefreshCw size={15} /></button></div>
              {reservationsLoading ? (
                <div className="flex min-h-[160px] items-center justify-center text-text-secondary"><Loader2 size={22} className="animate-spin" /></div>
              ) : nonDraftReservations.length === 0 ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center text-text-muted"><ShoppingBag size={28} className="opacity-40" /><div className="text-sm font-medium">Немає резервів</div></div>
              ) : (
                <div className="space-y-3">{nonDraftReservations.map((reservation) => <div key={reservation.id} className="rounded-xl border border-panel-border bg-panel-bg p-3"><div className="mb-2 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-text-primary">{reservation.customer_name} · версія #{reservation.version_no}</div><div className="text-[11px] uppercase tracking-widest text-text-secondary">{new Date(reservation.confirmed_at || reservation.created_at).toLocaleString()}</div></div><span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest", getStatusMeta(reservation.status).className)}>{getStatusMeta(reservation.status).label}</span></div><div className="space-y-2">{reservation.customer_reservation_items.map((item) => <div key={item.id || `${reservation.id}-${item.sku}`} className="flex items-center justify-between rounded-lg border border-panel-border bg-bg-primary px-3 py-2 text-sm"><span className="text-text-primary">{item.sku}</span><span className="font-[family-name:var(--font-jetbrains)] font-bold text-orange-400">{item.qty}</span></div>)}</div></div>)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-3 pt-0 lg:p-4 lg:pt-0">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-panel-border bg-panel-bg shadow-[var(--panel-shadow)]">
          <div className="grid grid-cols-12 gap-4 border-b border-panel-border bg-slate-50/80 p-4 font-[family-name:var(--font-jetbrains)] text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-5 text-slate-600">Товар</div>
            <div className="col-span-4 text-slate-600">Магазин</div>
            <div className="col-span-2 text-right text-slate-600">К-сть</div>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
            {resultsLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary"><Loader2 size={32} className="animate-spin text-orange-500" /><span className="font-[family-name:var(--font-jetbrains)] text-xs uppercase tracking-widest">Завантаження даних розподілу...</span></div>
            ) : !Array.isArray(resultsData) || resultsData.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted"><div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-panel-border bg-panel-border/30"><ShoppingBag size={32} className="opacity-50" /></div><span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Розподіл ще не сформовано</span></div>
            ) : (
              <div className="space-y-1">{resultsData.map((row, index) => <motion.div key={`${row.product_name}-${row.spot_name}-${index}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }} className="grid grid-cols-12 items-center gap-4 rounded-lg border border-transparent p-3 transition-colors hover:border-panel-border hover:bg-bg-primary"><div className="col-span-1 text-center font-[family-name:var(--font-jetbrains)] text-[11px] text-slate-400">{index + 1}</div><div className="col-span-5 line-clamp-1 text-sm font-bold text-text-primary">{row.product_name}</div><div className="col-span-4 line-clamp-1 text-xs font-medium text-text-secondary">{row.spot_name}</div><div className="col-span-2 text-right"><span className="inline-flex min-w-[3.5rem] items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 font-[family-name:var(--font-jetbrains)] text-sm font-black text-orange-400">{row.quantity_to_ship}</span></div></motion.div>)}</div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-panel-border bg-slate-50/80 p-3 font-[family-name:var(--font-jetbrains)] text-[11px] font-medium uppercase tracking-widest text-slate-500">
            <div>Всього рядків: <span className="font-bold text-slate-900">{resultsData?.length || 0}</span></div>
            <div className="flex items-center gap-2"><span>Оновлено: <span className="font-bold text-slate-900">{new Date().toLocaleTimeString()}</span></span><button onClick={() => refreshResults()} className="rounded-md border border-transparent p-1.5 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-500"><RefreshCw size={14} /></button></div>
          </div>
        </div>
      </div>
    </div>
  );
};
