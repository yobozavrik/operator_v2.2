export interface KonditerkaDistributionEmailRow {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    delivery_status?: string | null;
    min_stock?: number | null;
    current_stock?: number | null;
    avg_sales?: number | null;
}

export interface SendKonditerkaDistributionEmailInput {
    businessDate: string;
    rows: KonditerkaDistributionEmailRow[];
    productionRowsCount: number;
}

export interface SendKonditerkaDistributionEmailResult {
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

function escapeCsv(value: unknown): string {
    const raw = String(value ?? '');
    if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

function buildDistributionCsv(rows: KonditerkaDistributionEmailRow[]): string {
    const header = [
        'Товар',
        'Магазин',
        'Количество',
        'Статус',
        'Мин. остаток',
        'Тек. остаток',
        'Ср. продажи',
    ];

    const lines = rows.map((row) =>
        [
            escapeCsv(row.product_name),
            escapeCsv(row.spot_name),
            escapeCsv(safeNum(row.quantity_to_ship)),
            escapeCsv(row.delivery_status || ''),
            escapeCsv(row.min_stock ?? ''),
            escapeCsv(row.current_stock ?? ''),
            escapeCsv(row.avg_sales ?? ''),
        ].join(',')
    );

    return '\uFEFF' + [header.join(','), ...lines].join('\n');
}

function buildDistributionHtml(
    businessDate: string,
    rows: KonditerkaDistributionEmailRow[],
    productionRowsCount: number
): string {
    const totalQty = rows.reduce((sum, row) => sum + safeNum(row.quantity_to_ship), 0);
    const topRows = rows.slice(0, 15);

    const topTable = topRows
        .map(
            (row) =>
                `<tr>
<td style="padding:6px 10px;border:1px solid #ddd;">${row.product_name || ''}</td>
<td style="padding:6px 10px;border:1px solid #ddd;">${row.spot_name || ''}</td>
<td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${safeNum(row.quantity_to_ship)}</td>
</tr>`
        )
        .join('');

    return `<div style="font-family:Arial,sans-serif;padding:16px;">
<h2 style="margin:0 0 12px 0;">Konditerka distribution ${businessDate}</h2>
<table style="border-collapse:collapse;margin:0 0 12px 0;">
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>Выпуск (позиций)</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${productionRowsCount}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>Строк распределения</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${rows.length}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd;"><b>Всего к отгрузке</b></td><td style="padding:6px 10px;border:1px solid #ddd;">${totalQty}</td></tr>
</table>
<p style="margin:0 0 8px 0;"><b>Топ-15 строк:</b></p>
<table style="border-collapse:collapse;">
<tr>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Товар</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Магазин</th>
<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">Количество</th>
</tr>
${topTable}
</table>
<p style="margin-top:12px;color:#666;font-size:12px;">Полный CSV приложен к письму.</p>
</div>`;
}

export async function sendKonditerkaDistributionEmail(
    input: SendKonditerkaDistributionEmailInput
): Promise<SendKonditerkaDistributionEmailResult> {
    const recipients = parseRecipients(process.env.KONDITERKA_DISTRIBUTION_EMAIL_TO);
    const subject = `Konditerka distribution ${input.businessDate}`;
    const resendApiKey = process.env.KONDITERKA_RESEND_API_KEY || process.env.RESEND_API_KEY;
    const from = process.env.KONDITERKA_DISTRIBUTION_EMAIL_FROM;

    if (!resendApiKey || !from || recipients.length === 0) {
        return {
            sent: false,
            skipped: true,
            status: 'skipped',
            subject,
            recipients,
            reason: 'Resend configuration is incomplete',
        };
    }

    const csv = buildDistributionCsv(input.rows);
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
                        filename: `konditerka-distribution-${input.businessDate}.csv`,
                        content: Buffer.from(csv, 'utf8').toString('base64'),
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
