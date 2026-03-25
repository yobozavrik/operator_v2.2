import { buildDistributionExcelBuffer, type ServerDistributionRow } from '@/lib/server-excel-export';
import { getDistributionEmailEnv } from '@/lib/distribution-env';

export type BranchName = 'bulvar' | 'konditerka' | 'florida';

// Compatible with all three branch row types
export interface DistributionEmailRow {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    delivery_status?: string | null;
    min_stock?: number | null;
    current_stock?: number | null;
    avg_sales?: number | null;
    unit?: string;
    packaging_enabled?: boolean;
    quantity_to_ship_packs_est?: number;
    calc_time?: string;
    created_at?: string;
}

export interface BranchDigestResult {
    branch: BranchName;
    status: 'ok' | 'failed' | 'skipped';
    reason?: string;
    rows: DistributionEmailRow[];
    productionRowsCount: number;
}

export interface SendCombinedDistributionEmailInput {
    businessDate: string;
    branches: BranchDigestResult[];
}

export interface SendCombinedDistributionEmailResult {
    sent: boolean;
    status: 'sent' | 'failed' | 'skipped';
    subject: string;
    recipients: string[];
    messageId?: string;
    reason?: string;
}

const BRANCH_LABELS: Record<BranchName, string> = {
    bulvar: 'Bulvar',
    konditerka: 'Konditerka',
    florida: 'Florida',
};

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

function parseRecipients(value: string | undefined): string[] {
    return String(value || '').split(/[;,]/g).map((v) => v.trim()).filter(Boolean);
}

function buildCombinedHtml(businessDate: string, branches: BranchDigestResult[]): string {
    const statusColor = (status: string) => {
        if (status === 'ok') return '#2e7d32';
        if (status === 'skipped') return '#f57c00';
        return '#c62828';
    };

    const statusRows = branches
        .map(
            (b) =>
                `<tr>
<td style="padding:6px 10px;border:1px solid #ddd;">${BRANCH_LABELS[b.branch]}</td>
<td style="padding:6px 10px;border:1px solid #ddd;color:${statusColor(b.status)};font-weight:bold;">${b.status.toUpperCase()}</td>
<td style="padding:6px 10px;border:1px solid #ddd;">${b.rows.length}</td>
<td style="padding:6px 10px;border:1px solid #ddd;">${b.productionRowsCount}</td>
<td style="padding:6px 10px;border:1px solid #ddd;color:#666;font-size:12px;">${b.reason || '—'}</td>
</tr>`
        )
        .join('');

    const branchSections = branches
        .filter((b) => b.rows.length > 0)
        .map((b) => {
            const totalQty = b.rows.reduce((sum, row) => sum + safeNum(row.quantity_to_ship), 0);
            const topRows = b.rows.slice(0, 10);
            const rowsHtml = topRows
                .map(
                    (row) =>
                        `<tr>
<td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(row.product_name)}</td>
<td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(row.spot_name)}</td>
<td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${safeNum(row.quantity_to_ship)}</td>
</tr>`
                )
                .join('');

            return `<h3 style="margin:16px 0 8px 0;">${BRANCH_LABELS[b.branch]} — всього: ${totalQty}</h3>
<table style="border-collapse:collapse;margin-bottom:4px;">
<tr>
<th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Товар</th>
<th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Магазин</th>
<th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">К-сть</th>
</tr>
${rowsHtml}
</table>
<p style="margin:0 0 4px 0;color:#666;font-size:12px;">Показано перших 10 рядків. Повний Excel у вкладенні.</p>`;
        })
        .join('');

    return `<div style="font-family:Arial,sans-serif;padding:16px;max-width:720px;">
<h2 style="margin:0 0 12px 0;">Distribution digest ${businessDate}</h2>
<table style="border-collapse:collapse;margin:0 0 16px 0;">
<tr>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Гілка</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Статус</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Рядків</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Виробництво</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Деталі</th>
</tr>
${statusRows}
</table>
${branchSections}
<p style="margin-top:16px;color:#666;font-size:12px;">Автоматичний дайджест. Excel-файли по кожній гілці — у вкладеннях.</p>
</div>`;
}

export async function sendCombinedDistributionEmail(
    input: SendCombinedDistributionEmailInput
): Promise<SendCombinedDistributionEmailResult> {
    // Use bulvar env as primary for the combined digest
    const env = getDistributionEmailEnv('bulvar');
    const resendApiKey = env.resendApiKey;
    const from = env.emailFrom;
    const recipients = parseRecipients(env.emailTo);

    const subject = `Distribution digest ${input.businessDate}`;

    if (!resendApiKey || !from || recipients.length === 0) {
        return { sent: false, status: 'failed', subject, recipients, reason: 'Resend configuration is incomplete' };
    }

    // Build 3 xlsx buffers in parallel — always include all 3 even if rows are empty
    const excelBuffers = await Promise.all(
        input.branches.map((b) =>
            buildDistributionExcelBuffer(
                BRANCH_LABELS[b.branch],
                input.businessDate,
                b.rows as ServerDistributionRow[]
            )
        )
    );

    const attachments = input.branches.map((b, i) => ({
        filename: `${b.branch}-distribution-${input.businessDate}.xlsx`,
        content: excelBuffers[i].toString('base64'),
    }));

    const html = buildCombinedHtml(input.businessDate, input.branches);

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from, to: recipients, subject, html, attachments }),
        });

        const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!response.ok) {
            return { sent: false, status: 'failed', subject, recipients, reason: payload?.message || `Resend HTTP ${response.status}` };
        }

        return { sent: true, status: 'sent', subject, recipients, messageId: payload?.id };
    } catch (error) {
        return {
            sent: false,
            status: 'failed',
            subject,
            recipients,
            reason: error instanceof Error ? error.message : 'Unknown resend error',
        };
    }
}
