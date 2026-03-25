import { buildDistributionExcelBuffer } from '@/lib/server-excel-export';
import { getDistributionEmailEnv } from '@/lib/distribution-env';

export interface BulvarDistributionEmailRow {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    delivery_status?: string | null;
    min_stock?: number | null;
    current_stock?: number | null;
    avg_sales?: number | null;
}

export interface SendBulvarDistributionEmailInput {
    businessDate: string;
    rows: BulvarDistributionEmailRow[];
    productionRowsCount: number;
}

export interface SendBulvarDistributionEmailResult {
    sent: boolean;
    skipped: boolean;
    status: 'sent' | 'skipped' | 'failed';
    subject: string;
    recipients: string[];
    messageId?: string;
    reason?: string;
}

function parseRecipients(value: string | undefined): string[] {
    return String(value || '')
        .split(/[;,]/g)
        .map((v) => v.trim())
        .filter(Boolean);
}

function safeNum(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function buildDistributionHtml(
    businessDate: string,
    rows: BulvarDistributionEmailRow[],
    productionRowsCount: number
): string {
    const totalQty = rows.reduce((sum, row) => sum + safeNum(row.quantity_to_ship), 0);
    const topRows = rows.slice(0, 15);

    const topTable = topRows
        .map(
            (row) =>
                `<tr>
<td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(row.product_name)}</td>
<td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(row.spot_name)}</td>
<td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${safeNum(row.quantity_to_ship)}</td>
</tr>`
        )
        .join('');

    return `<div style="font-family:Arial,sans-serif;padding:16px;">
<h2 style="margin:0 0 12px 0;">Bulvar distribution ${businessDate}</h2>
<table style="border-collapse:collapse;margin:0 0 12px 0;">
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>Р’С‹РїСѓСЃРє (РїРѕР·РёС†РёР№)</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${productionRowsCount}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>РЎС‚СЂРѕРє СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${rows.length}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>Р’СЃРµРіРѕ Рє РѕС‚РіСЂСѓР·РєРµ</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${totalQty}</td></tr>
</table>
<p style="margin:0 0 8px 0;"><b>РўРѕРї-15 СЃС‚СЂРѕРє:</b></p>
<table style="border-collapse:collapse;">
<tr>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">РўРѕРІР°СЂ</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">РњР°РіР°Р·РёРЅ</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">РљРѕР»РёС‡РµСЃС‚РІРѕ</th>
</tr>
${topTable}
</table>
<p style="margin-top:12px;color:#666;font-size:12px;">РџРѕР»РЅС‹Р№ Excel РїСЂРёР»РѕР¶РµРЅ Рє РїРёСЃСЊРјСѓ.</p>
</div>`;
}

export async function sendBulvarDistributionEmail(
    input: SendBulvarDistributionEmailInput
): Promise<SendBulvarDistributionEmailResult> {
    const env = getDistributionEmailEnv('bulvar');
    const recipients = parseRecipients(env.emailTo);
    const subject = `Bulvar distribution ${input.businessDate}`;
    const resendApiKey = env.resendApiKey;
    const from = env.emailFrom;

    if (!resendApiKey || !from || recipients.length === 0) {
        return {
            sent: false,
            skipped: false,
            status: 'failed',
            subject,
            recipients,
            reason: 'Resend configuration is incomplete',
        };
    }

    const excelBuffer = await buildDistributionExcelBuffer('Bulvar', input.businessDate, input.rows);
    const html = buildDistributionHtml(input.businessDate, input.rows, input.productionRowsCount);

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: recipients,
                subject,
                html,
                attachments: [
                    {
                        filename: `bulvar-distribution-${input.businessDate}.xlsx`,
                        content: excelBuffer.toString('base64'),
                    },
                ],
            }),
        });

        const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!response.ok) {
            return {
                sent: false,
                skipped: false,
                status: 'failed',
                subject,
                recipients,
                reason: payload?.message || `Resend HTTP ${response.status}`,
            };
        }

        return {
            sent: true,
            skipped: false,
            status: 'sent',
            subject,
            recipients,
            messageId: payload?.id,
        };
    } catch (error) {
        return {
            sent: false,
            skipped: false,
            status: 'failed',
            subject,
            recipients,
            reason: error instanceof Error ? error.message : 'Unknown resend error',
        };
    }
}

