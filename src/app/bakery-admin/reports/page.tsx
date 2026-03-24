'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BakeryAdminReports() {
    const [startDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    });
    const [endDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const [isExporting, setIsExporting] = useState(false);

    const { data: apiData, isLoading } = useSWR(`/api/bakery/analytics?start_date=${startDate}&end_date=${endDate}`, fetcher);

    const ranking = apiData?.ranking || {};
    const allStores = [...(ranking.top_stores || []), ...(ranking.bottom_stores || [])];

    const handleExport = async () => {
        setIsExporting(true);
        try {
            // Call the server-side export endpoint
            const res = await fetch(`/api/bakery/export?start_date=${startDate}&end_date=${endDate}`);
            if (!res.ok) throw new Error('Помилка генерації звіту');

            // Convert to blob and trigger download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `craft_bakery_report_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Export failed', error);
            alert('Помилка вивантаження. Перевірте консоль.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Звіти та Експорт</h1>
                    <div className="text-sm text-gray-500 mt-1">
                        Генерація та вивантаження даних за період: {startDate} — {endDate}
                    </div>
                </div>

                <button
                    onClick={handleExport}
                    disabled={isExporting || isLoading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                    {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    Завантажити Excel
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Available Reports Info */}
                <div className="bg-white rounded shadow-sm border border-gray-100 p-6 flex items-start gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 mb-2">Зведений звіт по магазинах</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Містить повну інформацію про продажі фрешу, продажі по дисконту, списання та втрачену вигоду (каннібалізацію) по кожному магазину за вибраний період.
                        </p>
                        <ul className="text-xs text-gray-400 space-y-1 ml-4 list-disc">
                            <li>Store ID та Назва</li>
                            <li>Кількість проданого (фреш + дисконт)</li>
                            <li>Відсоток каннібалізації (%)</li>
                            <li>Втрати від списань (грн)</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Прев'ю даних (Топ 5 записів)</h2>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-600">
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs">Магазин</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Фреш (шт)</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Разом (шт)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr>
                                    <td colSpan={3} className="text-center py-8 text-gray-500 text-sm">
                                        <Loader2 className="animate-spin mx-auto text-blue-500 mb-2" /> Завантаження даних...
                                    </td>
                                </tr>
                            )}
                            {(!isLoading && allStores.length === 0) && (
                                <tr>
                                    <td colSpan={3} className="text-center py-8 text-gray-500">Дані відсутні</td>
                                </tr>
                            )}
                            {allStores.slice(0, 5).map((store: any, idx: number) => (
                                <tr key={idx} className={cn("border-b border-gray-100", idx % 2 !== 0 ? "bg-gray-50/50" : "")}>
                                    <td className="py-3 px-4 font-medium text-gray-700">{store.store_name}</td>
                                    <td className="py-3 px-4 text-right text-emerald-600">{store.fresh_sold?.toLocaleString('uk-UA')}</td>
                                    <td className="py-3 px-4 text-right font-bold text-gray-700">{store.total_sold?.toLocaleString('uk-UA')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-100">
                    Повний список доступний лише у файлі Excel після вивантаження.
                </div>
            </div>
        </div>
    );
}
