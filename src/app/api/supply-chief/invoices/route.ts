import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { runGlmOcr } from '@/lib/glm-ocr';
import { normalizeSupplyInvoice } from '@/lib/supply-invoice-normalizer';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'cfo', 'coo', 'finance_analyst'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type SupplyInvoiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'needs_review' | 'posted' | 'failed';
  source_filename: string | null;
  source_mime_type: string | null;
  source: 'camera' | 'upload';
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string;
  confidence: number | null;
  normalized_payload: Record<string, unknown>;
  error_message: string | null;
};

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

function toPositiveInt(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function confidenceThreshold(): number {
  const raw = process.env.GLM_OCR_CONFIDENCE_THRESHOLD;
  if (!raw) return 0.85;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.85;
  return Math.max(0, Math.min(1, parsed));
}

export async function GET(request: Request) {
  const auth = await requireRole(ALLOWED_ROLES);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const limit = toPositiveInt(searchParams.get('limit'), 20, 100);
  const status = searchParams.get('status');

  try {
    const supabase = createServiceRoleClient();
    let query = supabase
      .schema('executive')
      .from('supply_invoices')
      .select('id,created_at,updated_at,status,source_filename,source_mime_type,source,invoice_number,invoice_date,supplier_name,total_amount,currency,confidence,normalized_payload,error_message')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && ['draft', 'needs_review', 'posted', 'failed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices: (data || []) as SupplyInvoiceRow[] });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(ALLOWED_ROLES);
  if (auth.error || !auth.user) return auth.error;

  let source: 'camera' | 'upload' = 'upload';
  let fileName = 'invoice';
  let mimeType = 'image/jpeg';

  try {
    const form = await request.formData();
    const sourceRaw = String(form.get('source') || 'upload').toLowerCase();
    source = sourceRaw === 'camera' ? 'camera' : 'upload';

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'empty file' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `file is too large. max size ${MAX_FILE_SIZE_BYTES} bytes` },
        { status: 413 }
      );
    }

    fileName = file.name || 'invoice';
    mimeType = file.type || 'image/jpeg';
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
    }

    const base64 = toBase64(await file.arrayBuffer());
    const ocr = await runGlmOcr({
      fileBase64: base64,
      mimeType,
      fileName,
    });
    const normalized = normalizeSupplyInvoice(ocr.parsedPayload);
    const confidence = ocr.confidence;
    const status = confidence !== null && confidence < confidenceThreshold() ? 'needs_review' : 'draft';

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .schema('executive')
      .from('supply_invoices')
      .insert({
        created_by: auth.user.id,
        source,
        source_filename: fileName,
        source_mime_type: mimeType,
        status,
        invoice_number: normalized.invoice_number,
        invoice_date: normalized.invoice_date,
        supplier_name: normalized.supplier_name,
        total_amount: normalized.total_amount,
        currency: normalized.currency,
        confidence,
        raw_text: ocr.rawText,
        ocr_payload: ocr.parsedPayload,
        normalized_payload: normalized,
      })
      .select('id,created_at,updated_at,status,source_filename,source_mime_type,source,invoice_number,invoice_date,supplier_name,total_amount,currency,confidence,normalized_payload,error_message')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoice: data as SupplyInvoiceRow }, { status: 201 });
  } catch (error) {
    try {
      const supabase = createServiceRoleClient();
      await supabase.schema('executive').from('supply_invoices').insert({
        created_by: auth.user.id,
        source,
        source_filename: fileName,
        source_mime_type: mimeType,
        status: 'failed',
        error_message: String(error).slice(0, 500),
      });
    } catch {
      // Ignore fallback logging errors.
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

