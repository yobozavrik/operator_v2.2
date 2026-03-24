import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/branch-api';
import { runGlmOcr } from '@/lib/glm-ocr';
import { normalizeSupplyInvoice } from '@/lib/supply-invoice-normalizer';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

function confidenceThreshold(): number {
  const raw = process.env.GLM_OCR_CONFIDENCE_THRESHOLD;
  if (!raw) return 0.85;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.85;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Validate session
  const { data: session, error: sessionError } = await supabase
    .schema('executive')
    .from('supply_mobile_sessions')
    .select('id, status, expires_at, created_by')
    .eq('token', token)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }
  if (session.status !== 'pending') {
    return NextResponse.json({ error: 'session already used or expired' }, { status: 409 });
  }
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .schema('executive')
      .from('supply_mobile_sessions')
      .update({ status: 'expired' })
      .eq('token', token);
    return NextResponse.json({ error: 'session expired' }, { status: 410 });
  }

  let fileName = 'invoice';
  let mimeType = 'image/jpeg';

  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'empty file' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'file too large (max 10 MB)' }, { status: 413 });
    }

    fileName = file.name || 'invoice';
    mimeType = file.type || 'image/jpeg';
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
    }

    const base64 = toBase64(await file.arrayBuffer());
    const ocr = await runGlmOcr({ fileBase64: base64, mimeType, fileName });
    const normalized = normalizeSupplyInvoice(ocr.parsedPayload);
    const confidence = ocr.confidence;
    const invoiceStatus = confidence !== null && confidence < confidenceThreshold() ? 'needs_review' : 'draft';

    const { data: invoice, error: insertError } = await supabase
      .schema('executive')
      .from('supply_invoices')
      .insert({
        created_by: session.created_by,
        source: 'camera',
        source_filename: fileName,
        source_mime_type: mimeType,
        status: invoiceStatus,
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
      .select('id, status, invoice_number, supplier_name, total_amount, currency, confidence')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Mark session as uploaded
    await supabase
      .schema('executive')
      .from('supply_mobile_sessions')
      .update({ status: 'uploaded', invoice_id: invoice.id })
      .eq('token', token);

    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (err) {
    // Log failed invoice
    try {
      const { data: failedInvoice } = await supabase
        .schema('executive')
        .from('supply_invoices')
        .insert({
          created_by: session.created_by,
          source: 'camera',
          source_filename: fileName,
          source_mime_type: mimeType,
          status: 'failed',
          error_message: String(err).slice(0, 500),
        })
        .select('id')
        .single();

      if (failedInvoice) {
        await supabase
          .schema('executive')
          .from('supply_mobile_sessions')
          .update({ status: 'uploaded', invoice_id: failedInvoice.id })
          .eq('token', token);
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
