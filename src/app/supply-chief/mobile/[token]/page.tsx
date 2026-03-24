'use client';

import { useParams } from 'next/navigation';
import { ChangeEvent, FormEvent, useState } from 'react';
import { CheckCircle2, FileImage, ScanLine, XCircle } from 'lucide-react';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function MobileUploadPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{
    invoice_number?: string;
    supplier_name?: string;
    total_amount?: number;
    currency?: string;
    confidence?: number;
  } | null>(null);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setUploadState('idle');
    setErrorMsg('');
    setResult(null);

    if (selected && selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(selected);
    } else {
      setPreview(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || uploadState === 'uploading') return;

    setUploadState('uploading');
    setErrorMsg('');

    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch(`/api/supply-chief/mobile-upload/${token}`, {
        method: 'POST',
        body,
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        invoice?: typeof result;
      };

      if (!res.ok) {
        throw new Error(json.error || `Помилка (${res.status})`);
      }

      setResult(json.invoice ?? null);
      setUploadState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setUploadState('error');
    }
  };

  if (uploadState === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50 px-6 text-center">
        <CheckCircle2 size={56} className="text-emerald-500" />
        <h1 className="text-2xl font-bold text-slate-900">Завантажено!</h1>
        <p className="text-sm text-slate-600">Накладну прийнято і відправлено на розпізнавання.</p>
        {result && (
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-700 shadow-sm">
            {result.supplier_name && <div><span className="font-semibold">Постачальник:</span> {result.supplier_name}</div>}
            {result.invoice_number && <div><span className="font-semibold">Накладна №:</span> {result.invoice_number}</div>}
            {result.total_amount != null && (
              <div><span className="font-semibold">Сума:</span> {result.total_amount} {result.currency || 'UAH'}</div>
            )}
            {result.confidence != null && (
              <div><span className="font-semibold">Точність OCR:</span> {Math.round(result.confidence * 100)}%</div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400">Можна закрити цю сторінку.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <ScanLine size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Завантажте фото накладної</h1>
          <p className="mt-1 text-sm text-slate-500">Оберіть файл з галереї або зробіть знімок</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {preview ? (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="preview" className="w-full object-contain" style={{ maxHeight: 320 }} />
            </div>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-400">
              <FileImage size={36} />
              <span className="text-sm">Фото з'явиться тут</span>
            </div>
          )}

          {/* Buttons row: camera + gallery */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-100">
              <ScanLine size={18} />
              Камера
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFileChange}
              />
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-100">
              <FileImage size={18} />
              Галерея
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
            </label>
          </div>

          {uploadState === 'error' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || uploadState === 'uploading'}
            className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 active:bg-slate-800"
          >
            {uploadState === 'uploading' ? 'Завантаження...' : 'Відправити'}
          </button>
        </form>
      </div>
    </div>
  );
}
