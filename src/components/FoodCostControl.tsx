'use client';

import React, { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Calendar, TrendingUp, TrendingDown, Minus, Check, Sparkles, Loader2, Download, Truck, BarChart2, Target, AlertTriangle, Calculator } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import { authedFetcher } from '@/lib/authed-fetcher';
import type { FoodCostSummary, CategoryMetrics, ProductMetrics, Recommendation, SparkPoint } from '@/app/api/foodcost/route';
import type { SupplierRow, IngredientRow } from '@/app/api/foodcost/supply/route';
import type { WeekData } from '@/app/api/foodcost/history/route';
import type { NormativeData } from '@/app/api/foodcost/normative/route';

interface AiAnalysis {
    summary: string;
    drivers: string[];
    problems: string[];
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FoodCostData {
    periodLabel: string;
    summary: FoodCostSummary;
    categories: CategoryMetrics[];
    recommendations: Recommendation[];
    analysis: { drivers: string[]; problems: string[] };
    sparkline: SparkPoint[];
}

const PERIODS = [
    { value: 'last_week', label: 'Минулий тиждень' },
    { value: 'last_2_weeks', label: 'Минулі 2 тижні' },
    { value: 'last_7', label: 'Останні 7 днів' },
    { value: 'last_14', label: 'Останні 14 днів' },
    { value: 'last_month', label: 'Минулий місяць' },
];

import { fmt, fmtK, delta } from './food-cost/utils';
import { KpiCard, Spark } from './food-cost/KpiCard';
import { PriorityBadge, RecRow } from './food-cost/RecommendationRow';

// ─── Trend Arrow ──────────────────────────────────────────────────────────────

function TrendArrow({ delta, invert = false }: { delta: number; invert?: boolean }) {
    if (Math.abs(delta) < 0.05) return <Minus size={12} className="text-slate-400 inline" />;
    const positive = invert ? delta < 0 : delta > 0;
    return positive
        ? <TrendingUp size={12} className="text-green-500 inline" />
        : <TrendingDown size={12} className="text-red-500 inline" />;
}

function DeltaText({ val, unit = '%', invert = false, decimals = 1 }: { val: number; unit?: string; invert?: boolean; decimals?: number }) {
    if (Math.abs(val) < 0.01) return <span className="text-slate-400 text-xs">—</span>;
    const positive = invert ? val < 0 : val > 0;
    const sign = val > 0 ? '+' : '';
    return (
        <span className={`text-xs font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>
            {sign}{val.toFixed(decimals)}{unit}
        </span>
    );
}

// ─── Supply Tab ───────────────────────────────────────────────────────────────

interface SupplyData {
    suppliers: (SupplierRow & { prev_amount: number })[];
    ingredients: IngredientRow[];
    supply_count_current: number;
    supply_count_previous: number;
    total_current: number;
    total_previous: number;
}

function IngredientsTab({ period }: { period: string }) {
    const { data, error, isLoading } = useSWR<SupplyData>(
        `/api/foodcost/supply?period=${period}`,
        authedFetcher,
        { revalidateOnFocus: false }
    );
    const [sortBy, setSortBy] = useState<'amount' | 'delta' | 'name'>('delta');

    if (isLoading) return (
        <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Завантаження цін...
        </div>
    );
    if (error) return <div className="p-6 text-red-500 text-sm">Помилка: {error.message}</div>;
    if (!data || data.ingredients.length === 0) return (
        <div className="p-8 text-slate-400 text-sm text-center">Немає даних про інгредієнти за цей період</div>
    );

    const rising = data.ingredients.filter(i => i.price_delta > 0.01);
    const falling = data.ingredients.filter(i => i.price_delta < -0.01);

    const sorted = [...data.ingredients].sort((a, b) => {
        if (sortBy === 'delta') return Math.abs(b.price_delta) - Math.abs(a.price_delta);
        if (sortBy === 'amount') return b.amount - a.amount;
        return a.ingredient_name.localeCompare(b.ingredient_name, 'uk');
    });

    // Group by category
    const CAT_ORDER = ['М\'ясо та птиця', 'Риба', 'Молочні продукти', 'Борошно та крупи', 'Яйця', 'Овочі', 'Фрукти та ягоди', 'Олія та жири', 'Спеції та добавки', 'Пакування', 'Інше'];
    const grouped = CAT_ORDER.reduce<Record<string, typeof sorted>>((acc, cat) => {
        const items = sorted.filter(i => i.category === cat);
        if (items.length) acc[cat] = items;
        return acc;
    }, {});
    // Add any uncategorized
    sorted.filter(i => !CAT_ORDER.includes(i.category)).forEach(i => {
        grouped['Інше'] = [...(grouped['Інше'] || []), i];
    });

    const IngRow = ({ ing }: { ing: typeof sorted[0] }) => {
        const pct = ing.price_per_unit_prev > 0
            ? ((ing.price_per_unit - ing.price_per_unit_prev) / ing.price_per_unit_prev) * 100
            : null;
        const up = ing.price_delta > 0.01;
        const down = ing.price_delta < -0.01;
        return (
            <tr className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2 pl-6 text-slate-700">{ing.ingredient_name}</td>
                <td className="py-2 text-right text-slate-400 text-xs">
                    {ing.price_per_unit_prev > 0 ? `${ing.price_per_unit_prev.toFixed(2)} грн` : '—'}
                </td>
                <td className="py-2 text-right font-semibold text-slate-800">
                    {ing.price_per_unit.toFixed(2)} грн/{ing.unit}
                </td>
                <td className="py-2 text-right">
                    {ing.price_per_unit_prev > 0 ? (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
                            up ? 'bg-red-50 text-red-600' : down ? 'bg-green-50 text-green-600' : 'text-slate-400'
                        }`}>
                            {up && <TrendingUp size={10} />}
                            {down && <TrendingDown size={10} />}
                            {up ? '+' : ''}{ing.price_delta.toFixed(2)} грн
                            {pct !== null && ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`}
                        </span>
                    ) : <span className="text-slate-300 text-xs">новий</span>}
                </td>
                <td className="py-2 text-right text-slate-400 text-xs">{ing.qty.toFixed(2)} {ing.unit}</td>
                <td className="py-2 text-right text-slate-600">{fmtK(ing.amount)} грн</td>
            </tr>
        );
    };

    return (
        <div className="p-5 space-y-4">
            {/* Summary chips */}
            <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                    <TrendingUp size={13} className="text-red-500" />
                    <span className="text-xs font-semibold text-red-600">{rising.length} подорожчало</span>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                    <TrendingDown size={13} className="text-green-500" />
                    <span className="text-xs font-semibold text-green-600">{falling.length} подешевшало</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-slate-500">{data.ingredients.length} інгредієнтів</span>
                </div>
                <div className="text-xs text-slate-400 self-center ml-auto">Топ-40 накладних</div>
            </div>

            {/* Sort */}
            <div className="flex gap-1">
                {([['delta', 'За зміною'], ['amount', 'За сумою'], ['name', 'За назвою']] as [typeof sortBy, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setSortBy(val)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${sortBy === val ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Grouped table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs font-semibold text-slate-400 uppercase border-b border-slate-200">
                        <th className="py-2.5 text-left">Інгредієнт</th>
                        <th className="py-2.5 text-right">Мин. тижд.</th>
                        <th className="py-2.5 text-right">Поточна ціна</th>
                        <th className="py-2.5 text-right">Зміна</th>
                        <th className="py-2.5 text-right">Закуплено</th>
                        <th className="py-2.5 text-right">Сума</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(grouped).map(([cat, items]) => (
                        <React.Fragment key={cat}>
                            <tr className="bg-slate-50 border-y border-slate-100">
                                <td colSpan={6} className="py-1.5 px-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                    {cat} <span className="font-normal text-slate-400">({items.length})</span>
                                </td>
                            </tr>
                            {items.map(ing => <IngRow key={ing.ingredient_id} ing={ing} />)}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Matrix Tab ────────────────────────────────────────────────────────────────

function MatrixTab({ categories }: { categories: CategoryMetrics[] }) {
    const [hovered, setHovered] = useState<string | null>(null);

    const allProducts = categories.flatMap(c =>
        c.products.filter(p => p.revenue > 500).map(p => ({ ...p, category_name: c.category_name }))
    ).map((p, i) => ({ ...p, uid: `${i}-${p.category_id}-${p.product_id}` }));

    if (allProducts.length === 0) return <div className="p-8 text-slate-400 text-sm text-center">Недостатньо даних</div>;

    const maxMargin = Math.max(...allProducts.map(p => Math.abs(p.margin)));
    const maxFc = Math.min(Math.max(...allProducts.map(p => p.foodcost_pct)), 100);
    const FC_THRESHOLD = 40; // target FC
    const MARGIN_THRESHOLD = 5000; // median margin split

    const quadrantLabel = (fc: number, margin: number) => {
        if (fc <= FC_THRESHOLD && margin >= MARGIN_THRESHOLD) return { label: 'Зірки', color: 'text-green-700', bg: 'bg-green-50' };
        if (fc > FC_THRESHOLD && margin >= MARGIN_THRESHOLD) return { label: 'Дійні корови', color: 'text-orange-600', bg: 'bg-orange-50' };
        if (fc <= FC_THRESHOLD && margin < MARGIN_THRESHOLD) return { label: 'Питання', color: 'text-blue-600', bg: 'bg-blue-50' };
        return { label: 'Баласт', color: 'text-red-600', bg: 'bg-red-50' };
    };

    const dotColor = (fc: number, margin: number) => {
        const q = quadrantLabel(fc, margin);
        if (q.label === 'Зірки') return 'bg-green-500';
        if (q.label === 'Дійні корови') return 'bg-orange-400';
        if (q.label === 'Питання') return 'bg-blue-400';
        return 'bg-red-400';
    };

    return (
        <div className="p-5 space-y-4">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs">
                {[
                    { label: 'Зірки', color: 'bg-green-500', desc: 'Низький ФК + висока маржа → просувати' },
                    { label: 'Дійні корови', color: 'bg-orange-400', desc: 'Високий ФК + висока маржа → оптимізувати ціну' },
                    { label: 'Питання', color: 'bg-blue-400', desc: 'Низький ФК + мала маржа → стимулювати продажі' },
                    { label: 'Баласт', color: 'bg-red-400', desc: 'Високий ФК + мала маржа → прибрати' },
                ].map(q => (
                    <div key={q.label} className="flex items-center gap-1.5 text-slate-600">
                        <div className={`w-2.5 h-2.5 rounded-full ${q.color}`} />
                        <span className="font-semibold">{q.label}</span>
                        <span className="text-slate-400">— {q.desc}</span>
                    </div>
                ))}
            </div>

            {/* Matrix */}
            <div className="relative border border-slate-200 rounded-lg overflow-hidden" style={{ height: 400 }}>
                {/* Quadrant backgrounds */}
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none">
                    <div className="bg-blue-50/40 border-r border-b border-slate-200 flex items-start justify-start p-2">
                        <span className="text-xs font-semibold text-blue-400">Питання</span>
                    </div>
                    <div className="bg-green-50/40 border-b border-slate-200 flex items-start justify-end p-2">
                        <span className="text-xs font-semibold text-green-500">Зірки</span>
                    </div>
                    <div className="bg-red-50/40 border-r border-slate-200 flex items-end justify-start p-2">
                        <span className="text-xs font-semibold text-red-400">Баласт</span>
                    </div>
                    <div className="bg-orange-50/40 flex items-end justify-end p-2">
                        <span className="text-xs font-semibold text-orange-400">Дійні корови</span>
                    </div>
                </div>

                {/* Axis labels */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-slate-400 pointer-events-none">
                    ← Вищий ФК&nbsp;&nbsp;&nbsp;&nbsp;Нижчий ФК →
                </div>
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg) translateY(50%)' }}>
                    Маржа ↑
                </div>

                {/* Dots */}
                {allProducts.map(p => {
                    // X: high FC = left, low FC = right
                    const x = 100 - Math.min((p.foodcost_pct / maxFc) * 100, 98);
                    // Y: high margin = top
                    const yVal = Math.max(p.margin, 0);
                    const y = 100 - Math.min((yVal / maxMargin) * 95, 95);
                    const color = dotColor(p.foodcost_pct, p.margin);
                    const isHov = hovered === p.uid;

                    return (
                        <div
                            key={p.uid}
                            className="absolute cursor-pointer"
                            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', zIndex: isHov ? 20 : 10 }}
                            onMouseEnter={() => setHovered(p.uid)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className={`rounded-full transition-all ${color} ${isHov ? 'w-4 h-4 ring-2 ring-white shadow-lg' : 'w-2.5 h-2.5'}`} />
                            {isHov && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-xl z-30 min-w-40">
                                    <div className="font-semibold">{p.product_name}</div>
                                    <div className="text-slate-300">{p.category_name}</div>
                                    <div className="mt-1 space-y-0.5">
                                        <div>ФК: <span className="font-semibold text-white">{p.foodcost_pct.toFixed(1)}%</span></div>
                                        <div>Маржа: <span className="font-semibold text-white">{fmtK(p.margin)} грн</span></div>
                                        <div>Виручка: {fmtK(p.revenue)} грн</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Table summary by quadrant */}
            <div className="grid grid-cols-2 gap-3">
                {(['Зірки', 'Дійні корови', 'Питання', 'Баласт'] as const).map(qLabel => {
                    const qProducts = allProducts.filter(p => quadrantLabel(p.foodcost_pct, p.margin).label === qLabel);
                    const colors: Record<string, string> = {
                        'Зірки': 'border-green-200 bg-green-50',
                        'Дійні корови': 'border-orange-200 bg-orange-50',
                        'Питання': 'border-blue-200 bg-blue-50',
                        'Баласт': 'border-red-200 bg-red-50',
                    };
                    const textColors: Record<string, string> = {
                        'Зірки': 'text-green-700',
                        'Дійні корови': 'text-orange-600',
                        'Питання': 'text-blue-600',
                        'Баласт': 'text-red-600',
                    };
                    return (
                        <div key={qLabel} className={`rounded-lg border p-3 ${colors[qLabel]}`}>
                            <div className={`text-xs font-bold mb-1.5 ${textColors[qLabel]}`}>
                                {qLabel} ({qProducts.length} поз.)
                            </div>
                            <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                {qProducts.slice(0, 6).map(p => (
                                    <div key={p.product_id} className="text-xs text-slate-600 truncate">
                                        {p.product_name} <span className="text-slate-400">{p.foodcost_pct.toFixed(0)}%</span>
                                    </div>
                                ))}
                                {qProducts.length > 6 && (
                                    <div className="text-xs text-slate-400">+{qProducts.length - 6} більше</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Heatmap Tab ─────────────────────────────────────────────────────────────

function HeatmapTab() {
    const { data, isLoading, error } = useSWR<WeekData[]>(
        '/api/foodcost/history?weeks=6',
        authedFetcher,
        { revalidateOnFocus: false }
    );

    if (isLoading) return (
        <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Завантаження історії...
        </div>
    );
    if (error || !data || data.length === 0) return (
        <div className="p-8 text-slate-400 text-sm text-center">Немає даних для теплової карти</div>
    );

    const catRevMap = new Map<string, { name: string; total: number }>();
    data.forEach(w => w.categories.forEach(c => {
        const ex = catRevMap.get(c.category_id);
        if (ex) ex.total += c.revenue;
        else catRevMap.set(c.category_id, { name: c.category_name, total: c.revenue });
    }));
    const allCats = Array.from(catRevMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([id, { name }]) => ({ id, name }));

    const fcCls = (fc: number) => {
        if (fc === 0) return 'bg-slate-100 text-slate-300';
        if (fc < 30) return 'bg-green-100 text-green-700';
        if (fc < 38) return 'bg-lime-100 text-lime-700';
        if (fc < 45) return 'bg-yellow-100 text-yellow-800';
        if (fc < 55) return 'bg-orange-100 text-orange-700';
        return 'bg-red-100 text-red-700';
    };
    const totalCls = (fc: number) => {
        if (fc < 30) return 'bg-green-200 text-green-800 font-bold';
        if (fc < 38) return 'bg-lime-200 text-lime-800 font-bold';
        if (fc < 45) return 'bg-yellow-200 text-yellow-900 font-bold';
        if (fc < 55) return 'bg-orange-200 text-orange-800 font-bold';
        return 'bg-red-200 text-red-800 font-bold';
    };

    return (
        <div className="p-5">
            <div className="flex gap-2 mb-4 flex-wrap text-xs">
                {[
                    { label: '< 30%', cls: 'bg-green-100 text-green-700' },
                    { label: '30–38%', cls: 'bg-lime-100 text-lime-700' },
                    { label: '38–45%', cls: 'bg-yellow-100 text-yellow-800' },
                    { label: '45–55%', cls: 'bg-orange-100 text-orange-700' },
                    { label: '> 55%', cls: 'bg-red-100 text-red-700' },
                ].map(l => (
                    <span key={l.label} className={`px-2 py-0.5 rounded-md font-semibold ${l.cls}`}>{l.label}</span>
                ))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-separate border-spacing-0.5">
                    <thead>
                        <tr>
                            <th className="py-2 pr-4 text-left text-slate-500 font-semibold min-w-36">Категорія</th>
                            {data.map(w => (
                                <th key={w.from} className="py-2 px-1 text-center text-slate-500 font-semibold whitespace-nowrap min-w-16">{w.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="py-1.5 pr-4 font-bold text-slate-700 text-xs">Всього</td>
                            {data.map(w => (
                                <td key={w.from} className={`py-1.5 px-2 text-center rounded-md text-xs ${totalCls(w.total_fc)}`}>
                                    {w.total_fc.toFixed(1)}%
                                </td>
                            ))}
                        </tr>
                        {allCats.map(cat => (
                            <tr key={cat.id}>
                                <td className="py-1.5 pr-4 text-slate-600 max-w-36 truncate">{cat.name}</td>
                                {data.map(w => {
                                    const c = w.categories.find(c => c.category_id === cat.id);
                                    return (
                                        <td key={w.from} className={`py-1.5 px-2 text-center rounded-md ${c ? fcCls(c.foodcost_pct) : 'text-slate-200'}`}>
                                            {c ? `${c.foodcost_pct.toFixed(1)}%` : '—'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Forecast Tab ─────────────────────────────────────────────────────────────

interface CatForecast {
    catId: string;
    catName: string;
    current: number;
    projected: number;
    trend: number;
}

function ForecastTab() {
    const { data, isLoading, error } = useSWR<WeekData[]>(
        '/api/foodcost/history?weeks=6',
        authedFetcher,
        { revalidateOnFocus: false }
    );

    if (isLoading) return (
        <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
    );
    if (error || !data || data.length < 2) return (
        <div className="p-8 text-slate-400 text-sm text-center">Недостатньо даних для прогнозу (потрібно мінімум 2 тижні)</div>
    );

    const n = data.length;
    const fcValues = data.map(w => w.total_fc);
    const xMean = (n - 1) / 2;
    const yMean = fcValues.reduce((s, v) => s + v, 0) / n;
    const ssXY = fcValues.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0);
    const ssXX = fcValues.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
    const b = ssXX !== 0 ? ssXY / ssXX : 0;
    const a = yMean - b * xMean;
    const projected = Math.max(0, a + b * n);

    const chartData = [
        ...data.map((w, i) => ({
            label: w.label,
            fc: parseFloat(w.total_fc.toFixed(1)),
            trend: parseFloat((a + b * i).toFixed(1)),
        })),
        { label: 'Прогноз', fc: null, trend: parseFloat(projected.toFixed(1)) },
    ];

    const trend = b > 0.3 ? 'зростаючий' : b < -0.3 ? 'спадаючий' : 'стабільний';
    const trendColor = b > 0.3 ? 'text-red-600' : b < -0.3 ? 'text-green-600' : 'text-slate-600';

    const catIds = Array.from(new Set(data.flatMap(w => w.categories.map(c => c.category_id))));
    const catForecasts: CatForecast[] = catIds.flatMap(catId => {
        const vals = data.map(w => w.categories.find(c => c.category_id === catId)?.foodcost_pct ?? null).filter((v): v is number => v !== null);
        if (vals.length < 2) return [];
        const slope = (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
        const proj = Math.max(0, vals[vals.length - 1] + slope);
        const catName = data.flatMap(w => w.categories).find(c => c.category_id === catId)?.category_name ?? catId;
        return [{ catId, catName, current: vals[vals.length - 1], projected: proj, trend: slope }];
    }).sort((a, b) => b.projected - a.projected).slice(0, 8);

    return (
        <div className="p-5 space-y-5">
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs text-slate-500 mb-1">Поточний ФК</div>
                    <div className={`text-xl font-bold ${fcValues[n - 1] > 50 ? 'text-red-600' : fcValues[n - 1] > 40 ? 'text-orange-500' : 'text-slate-800'}`}>
                        {fcValues[n - 1].toFixed(1)}%
                    </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs text-slate-500 mb-1">Прогноз (наст. тиждень)</div>
                    <div className={`text-xl font-bold ${projected > 50 ? 'text-red-600' : projected > 40 ? 'text-orange-500' : 'text-green-600'}`}>
                        {projected.toFixed(1)}%
                    </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs text-slate-500 mb-1">Тренд</div>
                    <div className={`text-sm font-bold ${trendColor}`}>{trend}</div>
                    <div className="text-xs text-slate-400">{b > 0 ? '+' : ''}{b.toFixed(2)} в.п./тиж.</div>
                </div>
            </div>

            <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Динаміка та прогноз ФК%</div>
                <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ left: -10, right: 30, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" width={40} />
                        <Tooltip formatter={(v) => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['-', '']} />
                        <ReferenceLine y={38} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'Ціль 38%', position: 'right', fontSize: 10, fill: '#22c55e' }} />
                        <Line type="monotone" dataKey="fc" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Факт" connectNulls={false} />
                        <Line type="monotone" dataKey="trend" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Тренд" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Прогноз по категоріях</div>
                <div className="space-y-1.5">
                    {catForecasts.map(c => (
                        <div key={c.catId} className="flex items-center gap-3">
                            <div className="w-36 text-xs text-slate-600 truncate">{c.catName}</div>
                            <div className="text-xs text-slate-400 w-12 text-right">{c.current.toFixed(1)}%</div>
                            <div className="text-slate-300 text-xs">→</div>
                            <div className={`text-xs font-semibold w-12 ${c.projected > 50 ? 'text-red-600' : c.projected > 40 ? 'text-orange-500' : 'text-green-600'}`}>
                                {c.projected.toFixed(1)}%
                            </div>
                            <div className={`text-xs ${c.trend > 0.5 ? 'text-red-500' : c.trend < -0.5 ? 'text-green-500' : 'text-slate-400'}`}>
                                {c.trend > 0.05 ? '↑' : c.trend < -0.05 ? '↓' : '→'} {Math.abs(c.trend).toFixed(1)} в.п./тиж.
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────

interface GoalsAdvice {
    fc_advice: { goal: string; gap: string; actions: string[] };
    high_fc_advice: { goal: string; actions: string[] };
    margin_advice: { goal: string; actions: string[] };
}

function GoalsTab({ data }: { data: FoodCostData }) {
    const TARGET_FC = 38;
    const TARGET_MARGIN_GROWTH = 5;
    const TARGET_HIGH_FC_COUNT = 5;

    const [advice, setAdvice] = useState<GoalsAdvice | null>(null);
    const [adviceLoading, setAdviceLoading] = useState(false);
    const [adviceError, setAdviceError] = useState<string | null>(null);

    const allProducts = data.categories.flatMap(c => c.products);
    const highFcProducts = allProducts.filter(p => p.foodcost_pct > 50 && p.revenue > 500);
    const negMarginProducts = allProducts.filter(p => p.margin < 0 && p.revenue > 200);
    const currentFc = data.summary.foodcost_pct;

    const overallOk = currentFc <= TARGET_FC && highFcProducts.length <= TARGET_HIGH_FC_COUNT;
    const overallWarn = !overallOk && currentFc <= TARGET_FC + 5;

    const fetchAdvice = () => {
        setAdviceLoading(true);
        setAdviceError(null);
        fetch('/api/foodcost/goals-advice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: data.summary,
                categories: data.categories,
                targets: { fc: TARGET_FC, highFcMax: TARGET_HIGH_FC_COUNT, marginGrowth: TARGET_MARGIN_GROWTH },
            }),
        })
            .then(r => r.json())
            .then((res: GoalsAdvice & { error?: string }) => {
                if (res.error) { setAdviceError(res.error); return; }
                setAdvice(res);
            })
            .catch(e => setAdviceError(e.message))
            .finally(() => setAdviceLoading(false));
    };

    return (
        <div className="p-5 space-y-4">
            {/* Alert banners */}
            {highFcProducts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={14} className="text-red-500" />
                        <span className="text-sm font-bold text-red-700">
                            {highFcProducts.length} позицій з фудкостом &gt; 50%
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {highFcProducts.slice(0, 6).map((p, i) => (
                            <div key={`hi-${i}-${p.product_id}`} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                                <span className="text-xs text-slate-700 truncate">{p.product_name}</span>
                                <span className="text-xs font-bold text-red-600 ml-2 shrink-0">{p.foodcost_pct.toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                    {highFcProducts.length > 6 && (
                        <div className="text-xs text-red-400 mt-2">+{highFcProducts.length - 6} більше</div>
                    )}
                </div>
            )}

            {negMarginProducts.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-orange-500" />
                        <span className="text-sm font-bold text-orange-700">
                            {negMarginProducts.length} позицій з від&apos;ємною маржею
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {negMarginProducts.slice(0, 5).map((p, i) => (
                            <span key={`neg-${i}-${p.product_id}`} className="text-xs bg-white border border-orange-100 rounded-md px-2 py-1 text-slate-700">
                                {p.product_name} <span className="text-red-500 font-semibold">{fmtK(p.margin)} грн</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* KPI Progress */}
            <div className="space-y-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Цілі та прогрес</div>

                <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">Загальний фудкост</span>
                        <span className={`text-sm font-bold ${currentFc <= TARGET_FC ? 'text-green-600' : currentFc <= TARGET_FC + 5 ? 'text-orange-500' : 'text-red-600'}`}>
                            {currentFc.toFixed(1)}% / ціль {TARGET_FC}%
                        </span>
                    </div>
                    <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${currentFc <= TARGET_FC ? 'bg-green-500' : currentFc <= 45 ? 'bg-orange-400' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(currentFc / 80 * 100, 100)}%` }}
                        />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                        <span>0%</span>
                        <span className="text-green-600 font-semibold">Ціль: {TARGET_FC}%</span>
                        <span>80%</span>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">Позиції з ФК &gt; 50%</span>
                        <span className={`text-sm font-bold ${highFcProducts.length <= TARGET_HIGH_FC_COUNT ? 'text-green-600' : 'text-red-600'}`}>
                            {highFcProducts.length} / ціль ≤ {TARGET_HIGH_FC_COUNT}
                        </span>
                    </div>
                    <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${highFcProducts.length <= TARGET_HIGH_FC_COUNT ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(highFcProducts.length / 20 * 100, 100)}%` }}
                        />
                    </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">Зміна маржі vs мин. тиждень</span>
                        <span className={`text-sm font-bold ${data.summary.margin_delta_pct >= TARGET_MARGIN_GROWTH ? 'text-green-600' : data.summary.margin_delta_pct >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {data.summary.margin_delta_pct > 0 ? '+' : ''}{data.summary.margin_delta_pct.toFixed(1)}% / ціль +{TARGET_MARGIN_GROWTH}%
                        </span>
                    </div>
                    <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${data.summary.margin_delta_pct >= TARGET_MARGIN_GROWTH ? 'bg-green-500' : data.summary.margin_delta_pct >= 0 ? 'bg-blue-400' : 'bg-red-500'}`}
                            style={{ width: `${Math.max(0, Math.min((data.summary.margin_delta_pct + 20) / 40 * 100, 100))}%` }}
                        />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                        <span>−20%</span><span>0%</span><span>+20%</span>
                    </div>
                </div>
            </div>

            {/* Status banner */}
            <div className={`rounded-xl p-4 border ${overallOk ? 'bg-green-50 border-green-200' : overallWarn ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-sm font-bold flex items-center gap-2 ${overallOk ? 'text-green-700' : overallWarn ? 'text-yellow-700' : 'text-red-700'}`}>
                    <Target size={14} />
                    {overallOk
                        ? 'Всі цілі виконуються'
                        : overallWarn
                        ? 'Увага: окремі показники поза нормою'
                        : 'Потрібні термінові дії: фудкост перевищує ціль'}
                </div>
            </div>

            {/* AI Advice Section */}
            <div className="border border-violet-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-violet-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-violet-500" />
                        <span className="text-sm font-bold text-violet-700">AI: Як досягти цілей</span>
                    </div>
                    {!advice && !adviceLoading && (
                        <button
                            onClick={fetchAdvice}
                            className="text-xs font-semibold text-violet-600 bg-white border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50 transition-colors"
                        >
                            Отримати рекомендації
                        </button>
                    )}
                    {adviceLoading && <Loader2 size={14} className="animate-spin text-violet-400" />}
                </div>

                {adviceError && (
                    <div className="px-4 py-3 text-xs text-red-500">{adviceError}</div>
                )}

                {adviceLoading && !advice && (
                    <div className="p-4 space-y-2 animate-pulse">
                        <div className="h-3 bg-slate-100 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-full" />
                        <div className="h-3 bg-slate-100 rounded w-5/6" />
                    </div>
                )}

                {advice && (
                    <div className="divide-y divide-slate-100">
                        {[
                            { key: 'fc', data: advice.fc_advice, color: 'text-orange-600', dot: 'bg-orange-400' },
                            { key: 'hfc', data: advice.high_fc_advice, color: 'text-red-600', dot: 'bg-red-400' },
                            { key: 'margin', data: advice.margin_advice, color: 'text-blue-600', dot: 'bg-blue-400' },
                        ].map(({ key, data: block, color, dot }) => (
                            <div key={key} className="px-4 py-3">
                                <div className={`text-xs font-bold mb-2 ${color}`}>{block.goal}</div>
                                <ul className="space-y-1.5">
                                    {block.actions.map((action, i) => (
                                        <li key={i} className="flex gap-2 text-xs text-slate-600">
                                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                                            {action}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Normative Tab ────────────────────────────────────────────────────────────

function NormativeTab() {
    const [labor, setLabor] = useState(15);
    const [overhead, setOverhead] = useState(10);
    const [applied, setApplied] = useState({ labor: 15, overhead: 10 });
    const [catFilter, setCatFilter] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'norm_fc' | 'total_fc' | 'name' | 'price'>('norm_fc');

    const { data, isLoading, error } = useSWR<NormativeData>(
        `/api/foodcost/normative?labor=${applied.labor}&overhead=${applied.overhead}`,
        authedFetcher,
        { revalidateOnFocus: false }
    );

    const fcCls = (fc: number) => {
        if (!fc) return 'text-slate-300';
        if (fc < 30) return 'text-green-600 font-semibold';
        if (fc < 38) return 'text-lime-600 font-semibold';
        if (fc < 50) return 'text-orange-500 font-semibold';
        return 'text-red-600 font-bold';
    };

    const fcBadgeCls = (fc: number) => {
        if (fc < 30) return 'bg-green-50 text-green-700';
        if (fc < 38) return 'bg-lime-50 text-lime-700';
        if (fc < 50) return 'bg-orange-50 text-orange-600';
        return 'bg-red-50 text-red-700';
    };

    if (isLoading) return (
        <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Завантаження техкарт...
        </div>
    );
    if (error) return <div className="p-6 text-red-500 text-sm">Помилка: {error.message}</div>;
    if (!data) return null;

    const cats = data.categories;
    const filtered = data.products.filter(p =>
        p.has_tech_card && (!catFilter || p.category_id === catFilter)
    );
    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === 'norm_fc') return b.norm_fc_pct - a.norm_fc_pct;
        if (sortBy === 'total_fc') return b.total_fc_pct - a.total_fc_pct;
        if (sortBy === 'price') return b.price - a.price;
        return a.product_name.localeCompare(b.product_name, 'uk');
    });

    return (
        <div className="p-5 space-y-4">
            {/* Coverage banner */}
            <div className="flex gap-3 items-center flex-wrap">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-slate-500">Техкарти: </span>
                    <span className="font-bold text-slate-800">{data.summary.with_cards}</span>
                    <span className="text-slate-400"> / {data.summary.total_products}</span>
                </div>
                <div className={`rounded-lg px-3 py-1.5 text-xs ${fcBadgeCls(data.summary.avg_norm_fc)}`}>
                    <span>Сер. норм. ФК: </span>
                    <span className="font-bold">{data.summary.avg_norm_fc.toFixed(1)}%</span>
                </div>
                {(applied.labor > 0 || applied.overhead > 0) && (
                    <div className={`rounded-lg px-3 py-1.5 text-xs ${fcBadgeCls(data.summary.avg_total_fc)}`}>
                        <span>З витратами: </span>
                        <span className="font-bold">{data.summary.avg_total_fc.toFixed(1)}%</span>
                    </div>
                )}
            </div>

            {/* Cost inputs */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-600 mb-3 flex items-center gap-1.5">
                    <Calculator size={12} />
                    Додаткові витрати (% від ціни продажу)
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-slate-500">Праця (ФОП)</label>
                            <span className="text-xs font-bold text-slate-700">{labor}%</span>
                        </div>
                        <input
                            type="range" min={0} max={40} step={1} value={labor}
                            onChange={e => setLabor(Number(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-slate-500">Накладні (оренда, комун.)</label>
                            <span className="text-xs font-bold text-slate-700">{overhead}%</span>
                        </div>
                        <input
                            type="range" min={0} max={40} step={1} value={overhead}
                            onChange={e => setOverhead(Number(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>
                </div>
                <button
                    onClick={() => setApplied({ labor, overhead })}
                    className="mt-3 text-xs font-semibold bg-slate-800 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                >
                    Перерахувати
                </button>
            </div>

            {/* Category breakdown */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-separate border-spacing-0.5">
                    <thead>
                        <tr>
                            <th className="py-1.5 text-left text-slate-500 font-semibold min-w-36">Категорія</th>
                            <th className="py-1.5 px-2 text-center text-slate-500 font-semibold">Позицій</th>
                            <th className="py-1.5 px-2 text-center text-slate-500 font-semibold">З/без карти</th>
                            <th className="py-1.5 px-2 text-center text-slate-500 font-semibold">Норм. ФК</th>
                            {(applied.labor > 0 || applied.overhead > 0) && (
                                <th className="py-1.5 px-2 text-center text-slate-500 font-semibold">Повний ФК</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {cats.map(cat => (
                            <tr
                                key={cat.category_id}
                                className={`cursor-pointer hover:bg-slate-50 ${catFilter === cat.category_id ? 'bg-blue-50' : ''}`}
                                onClick={() => setCatFilter(f => f === cat.category_id ? null : cat.category_id)}
                            >
                                <td className="py-1.5 pr-4 text-slate-700 truncate max-w-48">{cat.category_name}</td>
                                <td className="py-1.5 px-2 text-center text-slate-500">{cat.products_count}</td>
                                <td className="py-1.5 px-2 text-center">
                                    <span className={cat.with_cards < cat.products_count ? 'text-orange-500 font-semibold' : 'text-slate-400'}>
                                        {cat.with_cards}/{cat.products_count}
                                    </span>
                                </td>
                                <td className={`py-1.5 px-2 text-center rounded-md ${fcBadgeCls(cat.avg_norm_fc)}`}>
                                    {cat.avg_norm_fc > 0 ? `${cat.avg_norm_fc.toFixed(1)}%` : '—'}
                                </td>
                                {(applied.labor > 0 || applied.overhead > 0) && (
                                    <td className={`py-1.5 px-2 text-center rounded-md ${fcBadgeCls(cat.avg_total_fc)}`}>
                                        {cat.avg_total_fc > 0 ? `${cat.avg_total_fc.toFixed(1)}%` : '—'}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {catFilter && (
                <button
                    onClick={() => setCatFilter(null)}
                    className="text-xs text-blue-500 hover:underline"
                >
                    ✕ Скинути фільтр категорії
                </button>
            )}

            {/* Products table */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-600">
                        Позиції ({sorted.length})
                    </div>
                    <div className="flex gap-1">
                        {([['norm_fc', 'За норм. ФК'], ['total_fc', 'За повн. ФК'], ['price', 'За ціною'], ['name', 'За назвою']] as [typeof sortBy, string][]).map(([val, label]) => (
                            <button key={val} onClick={() => setSortBy(val)}
                                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${sortBy === val ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-xs font-semibold text-slate-400 uppercase border-b border-slate-200">
                            <th className="py-2.5 text-left">Позиція</th>
                            <th className="py-2.5 text-right">Ціна</th>
                            <th className="py-2.5 text-right">Норм. собівартість</th>
                            <th className="py-2.5 text-right">Норм. ФК%</th>
                            {(applied.labor > 0 || applied.overhead > 0) && (
                                <th className="py-2.5 text-right">Повний ФК%</th>
                            )}
                            <th className="py-2.5 text-right text-slate-300">Інгр.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(p => (
                            <tr key={p.product_id} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-2 text-slate-700">
                                    <div>{p.product_name}</div>
                                    <div className="text-xs text-slate-400">{p.category_name}</div>
                                </td>
                                <td className="py-2 text-right text-slate-500 text-xs">{p.price > 0 ? `${p.price} грн` : '—'}</td>
                                <td className="py-2 text-right text-slate-600 text-xs">{p.norm_cost.toFixed(2)} грн</td>
                                <td className={`py-2 text-right text-sm ${fcCls(p.norm_fc_pct)}`}>
                                    {p.price > 0 ? `${p.norm_fc_pct.toFixed(1)}%` : '—'}
                                </td>
                                {(applied.labor > 0 || applied.overhead > 0) && (
                                    <td className={`py-2 text-right text-sm ${fcCls(p.total_fc_pct)}`}>
                                        {p.price > 0 ? `${p.total_fc_pct.toFixed(1)}%` : '—'}
                                    </td>
                                )}
                                <td className="py-2 text-right text-xs text-slate-300">{p.ingredients_count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Product Row ──────────────────────────────────────────────────────────────

function PriceModeling({ p }: { p: ProductMetrics }) {
    const costPerUnit = p.qty > 0 ? p.cost / p.qty : 0;
    const [newPrice, setNewPrice] = useState<string>(String(p.price));

    const np = parseFloat(newPrice) || p.price;
    const newFc = costPerUnit > 0 && np > 0 ? (costPerUnit / np) * 100 : p.foodcost_pct;
    const newMargin = (np - costPerUnit) * p.qty;
    const fcDelta = newFc - p.foodcost_pct;
    const marginDelta = newMargin - p.margin;
    const changed = np !== p.price;

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-bold text-slate-700 mb-3">Моделювання ціни</div>
            <div className="flex items-center gap-4 mb-3">
                <div>
                    <div className="text-xs text-slate-500 mb-1">Поточна ціна (за {p.unit})</div>
                    <div className="text-sm font-semibold text-slate-700">{p.price} грн</div>
                </div>
                <div className="text-slate-400 text-lg">→</div>
                <div>
                    <div className="text-xs text-slate-500 mb-1">Нова ціна (за {p.unit})</div>
                    <div className="flex items-center gap-1 border border-slate-300 rounded px-2 py-1 bg-white">
                        <span className="text-xs text-slate-400">₴</span>
                        <input
                            type="number"
                            value={newPrice}
                            onChange={e => setNewPrice(e.target.value)}
                            className="w-20 text-sm outline-none bg-transparent"
                            step="0.5"
                            min="0"
                        />
                    </div>
                </div>
            </div>
            {changed ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded p-2">
                        <div className="text-xs text-slate-500">Фудкост</div>
                        <div className={`text-sm font-bold ${newFc > 50 ? 'text-red-600' : newFc > 40 ? 'text-orange-500' : 'text-green-600'}`}>
                            {newFc.toFixed(1)}%
                            <span className={`ml-1 text-xs font-normal ${fcDelta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                ({fcDelta > 0 ? '+' : ''}{fcDelta.toFixed(1)} в.п.)
                            </span>
                        </div>
                    </div>
                    <div className="bg-slate-50 rounded p-2">
                        <div className="text-xs text-slate-500">Маржа/тиждень</div>
                        <div className={`text-sm font-bold ${newMargin < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                            {fmtK(newMargin)} грн
                            <span className={`ml-1 text-xs font-normal ${marginDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                ({marginDelta >= 0 ? '+' : ''}{fmtK(marginDelta)} грн)
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-xs text-slate-400">Змініть ціну вище, щоб побачити вплив на фудкост та маржу.</div>
            )}
        </div>
    );
}

function ProductRow({ p }: { p: ProductMetrics }) {
    const [open, setOpen] = useState(false);
    const fcColor = p.foodcost_pct > 50 ? 'text-red-600' : p.foodcost_pct > 40 ? 'text-orange-500' : 'text-slate-700';

    return (
        <>
            <tr
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => setOpen(o => !o)}
            >
                <td className="py-2.5 px-4 text-sm text-slate-700">
                    <span className="flex items-center gap-1">
                        {open ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                        {p.product_name}
                    </span>
                </td>
                <td className="py-2.5 px-3 text-sm text-slate-600 text-right whitespace-nowrap">
                    <TrendArrow delta={-p.foodcost_delta} /> {Math.round(p.cost / Math.max(p.qty, 1))} грн
                </td>
                <td className={`py-2.5 px-3 text-sm font-semibold text-right whitespace-nowrap ${fcColor}`}>
                    {p.foodcost_pct.toFixed(1)}% <DeltaText val={p.foodcost_delta} invert />
                </td>
                <td className="py-2.5 px-3 text-sm text-slate-600 text-right whitespace-nowrap">
                    {p.qty > 0 ? `${p.unit === 'кг' ? p.qty.toFixed(0) : Math.round(p.qty)} ${p.unit}` : '—'}
                </td>
                <td className="py-2.5 px-3 text-sm text-slate-700 text-right whitespace-nowrap">
                    <TrendArrow delta={p.margin_delta_pct} /> {fmtK(p.margin)} грн
                    <span className="ml-1"><DeltaText val={p.margin_delta_pct} /></span>
                </td>
                <td className="py-2.5 px-3 text-sm text-slate-600 text-right whitespace-nowrap">
                    {p.price > 0 ? `${p.price} грн` : '—'}
                </td>
            </tr>
            {open && (
                <tr className="bg-slate-50/60">
                    <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="text-xs text-slate-600 space-y-1.5">
                                <div className="font-bold text-slate-700 mb-2">Показники</div>
                                <div className="flex justify-between"><span className="text-slate-500">Виручка:</span><span className="font-medium">{fmt(p.revenue)} грн</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Собівартість:</span><span className="font-medium">{fmt(p.cost)} грн</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Собівартість/{p.unit}:</span><span className="font-medium">{p.qty > 0 ? Math.round(p.cost / p.qty) : '—'} грн</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Маржа:</span><span className={`font-medium ${p.margin < 0 ? 'text-red-600' : ''}`}>{fmt(p.margin)} грн</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">ФК мин. тиждень:</span><span className="font-medium">{p.foodcost_pct_prev.toFixed(1)}%</span></div>
                            </div>
                            <PriceModeling p={p} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Category Row ─────────────────────────────────────────────────────────────

function CategoryRow({ cat }: { cat: CategoryMetrics }) {
    const [open, setOpen] = useState(false);
    const fcColor = cat.foodcost_pct > 50 ? 'text-red-600' : cat.foodcost_pct > 40 ? 'text-orange-500' : 'text-slate-700';

    return (
        <>
            <tr
                className="border-b border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
                onClick={() => setOpen(o => !o)}
            >
                <td className="py-3 px-4 font-bold text-slate-800 text-sm">
                    <span className="flex items-center gap-2">
                        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                        {cat.category_name}
                        <span className="text-xs font-normal text-slate-400">{cat.products.length}</span>
                    </span>
                </td>
                <td className="py-3 px-3 text-right" />
                <td className={`py-3 px-3 text-sm font-bold text-right ${fcColor}`}>
                    ФК: {cat.foodcost_pct.toFixed(1)}%
                    <span className="ml-1"><DeltaText val={cat.foodcost_delta} invert /></span>
                </td>
                <td className="py-3 px-3 text-right" />
                <td className="py-3 px-3 text-sm font-semibold text-right text-slate-700">
                    Маржа: {fmtK(cat.margin)} грн
                    <span className="ml-1"><DeltaText val={cat.margin_delta_pct} /></span>
                </td>
                <td className="py-3 px-3 text-right" />
            </tr>
            {open && cat.products.map(p => <ProductRow key={p.product_id} p={p} />)}
        </>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type MainTab = 'positions' | 'supply' | 'matrix' | 'heatmap' | 'forecast' | 'goals' | 'normative';

async function exportToExcel(data: FoodCostData, tab: MainTab, historyData?: WeekData[]) {
    try {
        const response = await fetch('/api/foodcost/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, tab, historyData }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to export');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `foodcost_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (err: any) {
        console.error('Export error:', err);
        alert('Помилка експорту: ' + err.message);
    }
}

export default function FoodCostControl() {
    const [period, setPeriod] = useState('last_week');
    const [periodOpen, setPeriodOpen] = useState(false);
    const [analysisOpen, setAnalysisOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<MainTab>('positions');
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const { data, error, isLoading } = useSWR<FoodCostData>(
        `/api/foodcost?period=${period}`,
        authedFetcher,
        { revalidateOnFocus: false }
    );

    // Auto-trigger AI analysis when data loads
    useEffect(() => {
        if (!data?.summary || !data?.categories) return;
        setAiAnalysis(null);
        setAiError(null);
        setAiLoading(true);

        fetch('/api/foodcost/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: data.summary, categories: data.categories }),
        })
            .then(r => r.json())
            .then((res: AiAnalysis & { error?: string }) => {
                if (res.error) { setAiError(res.error); return; }
                setAiAnalysis(res);
            })
            .catch(e => setAiError(e.message))
            .finally(() => setAiLoading(false));
    }, [data]);

    const handleAccept = useCallback(() => { /* could log to analytics */ }, []);

    const periodLabel = PERIODS.find(p => p.value === period)?.label ?? '';
    const nowStr = new Date().toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

                {/* ── Header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">
                            🧑‍🍳 Контроль фудкосту
                        </h1>
                        {data && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                Звіт по фудкосту за <span className="font-semibold text-slate-700">{data.periodLabel}</span>
                                &nbsp;· Дані актуальні на {nowStr}
                            </p>
                        )}
                    </div>

                    {/* Period picker */}
                    <div className="relative">
                        <button
                            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white hover:bg-slate-50 transition-colors"
                            onClick={() => setPeriodOpen(o => !o)}
                        >
                            <Calendar size={14} />
                            {periodLabel}
                            <ChevronDown size={14} />
                        </button>
                        {periodOpen && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden w-52">
                                {PERIODS.map(p => (
                                    <button
                                        key={p.value}
                                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${p.value === period ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                                        onClick={() => { setPeriod(p.value); setPeriodOpen(false); }}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Loading ── */}
                {isLoading && (
                    <div className="grid grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse" />
                        ))}
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                        Помилка завантаження даних: {error.message}
                    </div>
                )}

                {data && (
                    <>
                        {/* ── KPI Cards ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard
                                label="Дохід"
                                value={`${fmt(data.summary.revenue)} грн`}
                                deltaVal={data.summary.revenue_delta_pct}
                                deltaUnit="%"
                                spark={data.sparkline}
                                dataKey="revenue"
                            />
                            <KpiCard
                                label="Собівартість"
                                value={`${fmt(data.summary.cost)} грн`}
                                deltaVal={data.summary.cost_delta_pct}
                                deltaUnit="%"
                                invertDelta
                                spark={data.sparkline}
                                dataKey="cost"
                            />
                            <KpiCard
                                label="Маржа"
                                value={`${fmt(data.summary.margin)} грн`}
                                deltaVal={data.summary.margin_delta_pct}
                                deltaUnit="%"
                                spark={data.sparkline}
                                dataKey="margin"
                            />
                            <KpiCard
                                label="Фудкост %"
                                value={`${data.summary.foodcost_pct.toFixed(1)}%`}
                                deltaVal={data.summary.foodcost_delta}
                                deltaUnit=" в.п."
                                invertDelta
                                spark={data.sparkline}
                                dataKey="foodcost_pct"
                            />
                        </div>

                        {/* ── AI Analysis ── */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4">
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-3">
                                    <Sparkles size={14} className="text-violet-500" />
                                    <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">AI Аналіз</span>
                                    {aiLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
                                </div>

                                {/* Loading skeleton */}
                                {aiLoading && !aiAnalysis && (
                                    <div className="space-y-2 animate-pulse">
                                        <div className="h-4 bg-slate-100 rounded w-3/4" />
                                        <div className="h-4 bg-slate-100 rounded w-full" />
                                        <div className="h-4 bg-slate-100 rounded w-5/6" />
                                    </div>
                                )}

                                {/* AI Error fallback */}
                                {aiError && !aiLoading && (
                                    <p className="text-xs text-red-500">{aiError}</p>
                                )}

                                {/* AI Content */}
                                {aiAnalysis && (
                                    <>
                                        {aiAnalysis.summary && (
                                            <p className="text-sm text-slate-600 mb-4">{aiAnalysis.summary}</p>
                                        )}

                                        {analysisOpen && (
                                            <>
                                                {aiAnalysis.drivers.length > 0 && (
                                                    <div className="mb-4">
                                                        <h3 className="text-sm font-bold text-slate-900 mb-2">Рушії змін</h3>
                                                        <div className="space-y-2">
                                                            {aiAnalysis.drivers.map((d, i) => (
                                                                <p key={i} className="text-sm text-slate-600">
                                                                    <span className="font-semibold text-slate-800">
                                                                        {d.split('—')[0]}—
                                                                    </span>
                                                                    {d.split('—').slice(1).join('—')}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {aiAnalysis.problems.length > 0 && (
                                                    <div>
                                                        <h3 className="text-sm font-bold text-slate-900 mb-2">Проблемні зони</h3>
                                                        <div className="space-y-2">
                                                            {aiAnalysis.problems.map((p, i) => (
                                                                <p key={i} className="text-sm text-slate-600">
                                                                    <span className="font-semibold text-slate-800">
                                                                        {p.split('—')[0]}—
                                                                    </span>
                                                                    {p.split('—').slice(1).join('—')}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {aiAnalysis && (
                                <button
                                    className="w-full border-t border-slate-100 py-2.5 text-sm text-blue-600 font-semibold hover:bg-slate-50 flex items-center justify-center gap-1"
                                    onClick={() => setAnalysisOpen(o => !o)}
                                >
                                    {analysisOpen ? (
                                        <><ChevronUp size={14} /> Згорнути</>
                                    ) : (
                                        <><ChevronDown size={14} /> Розгорнути</>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* ── Recommendations ── */}
                        {data.recommendations.length > 0 && (
                            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                                <h2 className="text-sm font-bold text-slate-900">Рекомендації</h2>
                                {data.recommendations.map((rec, i) => (
                                    <RecRow key={i} rec={rec} onAccept={handleAccept} />
                                ))}
                            </div>
                        )}

                        {/* ── Tabbed Table ── */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* Tab header */}
                            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex gap-1 flex-wrap">
                                    {([
                                        { id: 'positions', label: 'Позиції', icon: null },
                                        { id: 'supply', label: 'Ціни', icon: <Truck size={12} /> },
                                        { id: 'matrix', label: 'Матриця', icon: <BarChart2 size={12} /> },
                                        { id: 'heatmap', label: 'Теплова', icon: null },
                                        { id: 'forecast', label: 'Прогноз', icon: <TrendingUp size={12} /> },
                                        { id: 'goals', label: 'Цілі', icon: <Target size={12} /> },
                                        { id: 'normative', label: 'Норматив', icon: <Calculator size={12} /> },
                                    ] as { id: MainTab; label: string; icon: React.ReactNode }[]).map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                activeTab === tab.id
                                                    ? 'bg-slate-900 text-white'
                                                    : 'text-slate-500 hover:bg-slate-100'
                                            }`}
                                        >
                                            {tab.icon}{tab.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => exportToExcel(data, activeTab, undefined)}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                                >
                                    <Download size={13} /> Excel
                                </button>
                            </div>

                            {/* Tab content */}
                            {activeTab === 'positions' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                <th className="py-3 px-4 text-left">Позиція</th>
                                                <th className="py-3 px-3 text-right">Собівартість</th>
                                                <th className="py-3 px-3 text-right">Фудкост %</th>
                                                <th className="py-3 px-3 text-right">Продано</th>
                                                <th className="py-3 px-3 text-right">Маржа</th>
                                                <th className="py-3 px-3 text-right">Ціна</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.categories.map(cat => (
                                                <CategoryRow key={cat.category_id} cat={cat} />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {activeTab === 'supply' && <IngredientsTab period={period} />}
                            {activeTab === 'matrix' && <MatrixTab categories={data.categories} />}
                            {activeTab === 'heatmap' && <HeatmapTab />}
                            {activeTab === 'forecast' && <ForecastTab />}
                            {activeTab === 'goals' && <GoalsTab data={data} />}
                            {activeTab === 'normative' && <NormativeTab />}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
