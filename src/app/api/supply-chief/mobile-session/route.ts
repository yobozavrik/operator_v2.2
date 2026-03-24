import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'cfo', 'coo', 'finance_analyst'];
const SESSION_TTL_MINUTES = 15;

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

function getAppBaseUrl(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const { headers } = request as { headers: Headers };
  const host = headers.get('x-forwarded-host') || headers.get('host') || 'localhost:3000';
  const proto = headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

// POST /api/supply-chief/mobile-session — create a new upload session
export async function POST(request: Request) {
  const auth = await requireRole(ALLOWED_ROLES);
  if (auth.error) return auth.error;
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();
  const baseUrl = getAppBaseUrl(request);
  const mobileUrl = `${baseUrl}/supply-chief/mobile/${token}`;

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .schema('executive')
      .from('supply_mobile_sessions')
      .insert({
        token,
        created_by: auth.user.id,
        expires_at: expiresAt,
        status: 'pending',
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 256,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    return NextResponse.json({ token, mobile_url: mobileUrl, qr_data_url: qrDataUrl, expires_at: expiresAt });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/supply-chief/mobile-session?token=xxx — poll session status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .schema('executive')
      .from('supply_mobile_sessions')
      .select('status, expires_at, invoice_id')
      .eq('token', token)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    const expired = new Date(data.expires_at) < new Date();
    if (expired && data.status === 'pending') {
      await supabase
        .schema('executive')
        .from('supply_mobile_sessions')
        .update({ status: 'expired' })
        .eq('token', token);
      return NextResponse.json({ status: 'expired' });
    }

    return NextResponse.json({ status: data.status, invoice_id: data.invoice_id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
