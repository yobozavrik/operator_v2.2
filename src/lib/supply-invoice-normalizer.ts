export type NormalizedInvoiceItem = {
  name: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
};

export type NormalizedSupplyInvoice = {
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string;
  items: NormalizedInvoiceItem[];
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').replace(/\s+/g, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const raw = record[key];
    const text = asString(raw);
    if (text) return text;
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = record[key];
    const num = asNumber(raw);
    if (num !== null) return num;
  }
  return null;
}

function extractItems(record: Record<string, unknown>): NormalizedInvoiceItem[] {
  const source = record.items;
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const name = pickString(row, ['name', 'item_name', 'product', 'description']) || 'Позиция';
      return {
        name,
        qty: pickNumber(row, ['qty', 'quantity']),
        unit_price: pickNumber(row, ['unit_price', 'price']),
        line_total: pickNumber(row, ['line_total', 'total', 'amount']),
      } satisfies NormalizedInvoiceItem;
    })
    .filter((item): item is NormalizedInvoiceItem => item !== null);
}

function parseDateCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmY = normalized.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
  return null;
}

export function normalizeSupplyInvoice(payload: Record<string, unknown>): NormalizedSupplyInvoice {
  const invoiceNumber = pickString(payload, ['invoice_number', 'number', 'doc_number', 'накладна_номер']);
  const invoiceDateRaw = pickString(payload, ['invoice_date', 'date', 'doc_date', 'накладна_дата']);
  const supplierName = pickString(payload, ['supplier_name', 'vendor', 'counterparty', 'postachalnyk']);
  const totalAmount = pickNumber(payload, ['total_amount', 'total', 'amount', 'sum']);
  const currency = pickString(payload, ['currency']) || 'UAH';

  return {
    invoice_number: invoiceNumber,
    invoice_date: parseDateCandidate(invoiceDateRaw),
    supplier_name: supplierName,
    total_amount: totalAmount,
    currency,
    items: extractItems(payload),
  };
}

