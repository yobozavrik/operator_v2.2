'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, CheckCircle2, RefreshCw, ScanLine, Smartphone, Truck, UploadCloud } from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';
import { createClient } from '@/utils/supabase/client';

type InvoiceStatus = 'draft' | 'needs_review' | 'posted' | 'failed';

type SupplyInvoice = {
  id: string;
  created_at: string;
  status: InvoiceStatus;
  source_filename: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string;
  confidence: number | null;
  normalized_payload: Record<string, unknown>;
  error_message: string | null;
};

type InvoicesResponse = {
  invoices: SupplyInvoice[];
};

type MobileSession = {
  token: string;
  mobile_url: string;
  qr_data_url: string;
  expires_at: string;
};

type MobileSessionStatus = 'pending' | 'uploaded' | 'expired';

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Черновик',
  needs_review: 'Проверка',
  posted: 'Проведено',
  failed: 'Ошибка',
};

const statusClass: Record<InvoiceStatus, string> = {
  draft: 'border-slate-300 bg-slate-100 text-slate-700',
  needs_review: 'border-amber-300 bg-amber-100 text-amber-700',
  posted: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  failed: 'border-red-300 bg-red-100 text-red-700',
};

function getAuthHeader(sessionToken: string | undefined): HeadersInit {
  if (!sessionToken) return { Accept: 'application/json' };
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${sessionToken}`,
  };
}

// ─── QR Panel ────────────────────────────────────────────────────────────────

function QrPanel({ onUploaded }: { onUploaded: () => void }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<MobileSessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (token: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/supply-chief/mobile-session?token=${token}`);
          if (!res.ok) return;
          const json = (await res.json()) as { status: MobileSessionStatus };
          setSessionStatus(json.status);
          if (json.status === 'uploaded' || json.status === 'expired') {
            stopPolling();
            if (json.status === 'uploaded') onUploaded();
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
    },
    [stopPolling, onUploaded]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const createSession = useCallback(async () => {
    stopPolling();
    setSession(null);
    setSessionStatus(null);
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch('/api/supply-chief/mobile-session', {
        method: 'POST',
        headers: getAuthHeader(token),
      });
      const json = (await res.json().catch(() => ({}))) as MobileSession & { error?: string };
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setSession(json);
      setSessionStatus('pending');
      startPolling(json.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [stopPolling, startPolling]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (sessionStatus === 'uploaded') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 size={44} className="text-emerald-500" />
        <p className="text-base font-semibold text-slate-900">Фото отримано!</p>
        <p className="text-sm text-slate-500">Накладна обробляється і з&apos;явиться у списку.</p>
        <button
          type="button"
          onClick={createSession}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
        >
          <RefreshCw size={14} />
          Сканувати ще
        </button>
      </div>
    );
  }

  if (sessionStatus === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p className="text-sm text-slate-500">Сесія закінчилась (15 хв).</p>
        <button
          type="button"
          onClick={createSession}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw size={14} />
          Новий QR-код
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Smartphone size={36} className="text-slate-400" />
        <p className="text-sm text-slate-600">Відскануйте QR-код з телефону щоб сфотографувати накладну.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={createSession}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <ScanLine size={16} />
          {loading ? 'Генерація...' : 'Отримати QR-код'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={session.qr_data_url} alt="QR code" width={220} height={220} />
      </div>
      <p className="text-center text-xs text-slate-500">
        Відскануйте та завантажте фото з телефону
        <br />
        <span className="text-amber-600">Дійсний 15 хвилин</span>
      </p>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Очікуємо завантаження з телефону...
      </div>
      <button
        type="button"
        onClick={createSession}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 underline hover:text-slate-600"
      >
        <RefreshCw size={12} />
        Оновити код
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplyChiefPage() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'camera' | 'upload'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [postingId, setPostingId] = useState<string>('');

  const { data, mutate, isLoading } = useSWR<InvoicesResponse>(
    '/api/supply-chief/invoices?limit=50',
    authedFetcher,
    { refreshInterval: 45000 }
  );

  const sorted = useMemo(() => data?.invoices || [], [data]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || submitting) return;

    setSubmitting(true);
    setMessage('');
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const body = new FormData();
      body.append('source', source);
      body.append('file', file);

      const res = await fetch('/api/supply-chief/invoices', {
        method: 'POST',
        headers: getAuthHeader(token),
        body,
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(payload.error || `Upload failed (${res.status})`);
      }

      setMessage('Накладная добавлена в базу и отправлена на OCR.');
      setFile(null);
      await mutate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const markPosted = async (id: string) => {
    if (!id || postingId) return;
    setPostingId(id);
    setMessage('');

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/supply-chief/invoices/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(token),
        },
        body: JSON.stringify({ status: 'posted' }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || `Update failed (${res.status})`);
      }

      await mutate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPostingId('');
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.45),_transparent_35%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fc_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* Header */}
        <section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950">
              <ArrowLeft size={16} />
              Головне меню
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                <Truck size={14} />
                Контур постачання
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                Накладні з OCR у базу даних
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Скануйте накладну з телефону або завантажте файл — система розпізнає дані через GLM-OCR і зберігає запис у модулі бухгалтерії.
              </p>
            </div>
          </div>
        </section>

        {/* Upload + QR + List */}
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.4fr]">

          {/* File upload form */}
          <form onSubmit={onSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-slate-900">
              <UploadCloud size={18} />
              <h2 className="text-lg font-bold">Завантажити файл</h2>
            </div>

            <label className="mb-3 block text-sm font-semibold text-slate-700">Джерело</label>
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSource('upload')}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${source === 'upload' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                Файл
              </button>
              <button
                type="button"
                onClick={() => setSource('camera')}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${source === 'camera' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                Камера
              </button>
            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">Фото / PDF</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              capture={source === 'camera' ? 'environment' : undefined}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mb-4 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={!file || submitting}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Обробка...' : 'Сканувати і внести в БД'}
            </button>

            {message ? (
              <p className="mt-3 text-sm text-slate-700">{message}</p>
            ) : null}
          </form>

          {/* QR code panel */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-slate-900">
              <Smartphone size={18} />
              <h2 className="text-lg font-bold">З телефону</h2>
            </div>
            <QrPanel onUploaded={() => mutate()} />
          </section>

          {/* Invoices list */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Останні накладні</h2>
              {isLoading ? <span className="text-xs text-slate-500">Оновлення...</span> : null}
            </div>

            <div className="space-y-3">
              {sorted.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  Накладних ще немає.
                </div>
              ) : (
                sorted.map((row) => (
                  <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {row.supplier_name || row.source_filename || 'Без назви'}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass[row.status]}`}>
                        {statusLabel[row.status]}
                      </span>
                    </div>
                    <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                      <div>№: {row.invoice_number || '—'}</div>
                      <div>Дата: {row.invoice_date || '—'}</div>
                      <div>
                        Сума: {row.total_amount !== null ? `${row.total_amount} ${row.currency}` : '—'}
                      </div>
                      <div>
                        Довіра OCR: {row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : '—'}
                      </div>
                    </div>

                    {row.error_message ? (
                      <p className="mt-2 text-xs text-red-700">{row.error_message}</p>
                    ) : null}

                    {row.status !== 'posted' ? (
                      <button
                        type="button"
                        disabled={postingId === row.id}
                        onClick={() => markPosted(row.id)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        {postingId === row.id ? 'Проводимо...' : 'Підтвердити (posted)'}
                      </button>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
