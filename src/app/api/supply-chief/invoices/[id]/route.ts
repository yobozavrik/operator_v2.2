import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'cfo', 'coo', 'finance_analyst'];
const ALLOWED_STATUSES = ['draft', 'needs_review', 'posted', 'failed'] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(value: string): value is AllowedStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(value);
}

function mergePayload(
  existing: unknown,
  update: unknown
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const patch =
    update && typeof update === 'object' && !Array.isArray(update)
      ? (update as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ALLOWED_ROLES);
  if (auth.error || !auth.user) return auth.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  let body: {
    status?: string;
    review_notes?: string;
    normalized_payload?: Record<string, unknown>;
  };

  try {
    body = (await request.json()) as {
      status?: string;
      review_notes?: string;
      normalized_payload?: Record<string, unknown>;
    };
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const statusRaw = (body.status || '').trim();
  if (statusRaw && !isAllowedStatus(statusRaw)) {
    return NextResponse.json({ error: 'invalid status value' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: current, error: currentError } = await supabase
      .schema('executive')
      .from('supply_invoices')
      .select('id, normalized_payload')
      .eq('id', id)
      .single();

    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message || 'invoice not found' }, { status: 404 });
    }

    const nextPayload = mergePayload(current.normalized_payload, body.normalized_payload);
    const nextStatus = statusRaw || undefined;

    const { data, error } = await supabase
      .schema('executive')
      .from('supply_invoices')
      .update({
        status: nextStatus,
        review_notes: body.review_notes ?? null,
        normalized_payload: nextPayload,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id,created_at,updated_at,status,source_filename,source_mime_type,source,invoice_number,invoice_date,supplier_name,total_amount,currency,confidence,normalized_payload,review_notes,error_message')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoice: data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

