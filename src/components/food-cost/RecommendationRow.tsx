import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import type { Recommendation } from '@/app/api/foodcost/route';
import { fmtK } from './utils';

export function PriorityBadge({ priority }: { priority: Recommendation['priority'] }) {
    const map = {
        critical: 'bg-red-100 text-red-700',
        important: 'bg-orange-100 text-orange-700',
        opportunity: 'bg-blue-100 text-blue-700',
    };
    const labels = {
        critical: 'Критичні',
        important: 'Важливі',
        opportunity: 'Можливості',
    };
    return (
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${map[priority]}`}>
            {labels[priority]}
        </span>
    );
}

export function RecRow({ rec, onAccept }: { rec: Recommendation; onAccept: () => void }) {
    const [open, setOpen] = useState(false);
    const [accepted, setAccepted] = useState(false);

    return (
        <div className={`border rounded-xl overflow-hidden ${rec.priority === 'critical' ? 'border-red-200 bg-red-50/30' : rec.priority === 'important' ? 'border-orange-100' : 'border-slate-200'}`}>
            <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setOpen(o => !o)}
            >
                <div className="flex items-center gap-3">
                    <PriorityBadge priority={rec.priority} />
                    <span className="text-sm font-semibold text-slate-800">
                        {rec.type}: {rec.product_name}
                    </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-green-600">
                        +{fmtK(rec.monthly_impact)} грн/тиж.
                    </span>
                    {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3">
                    <p className="text-sm text-slate-600">{rec.description}</p>
                    {rec.current_price && rec.suggested_price && !accepted && (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-500">{rec.current_price} грн →</span>
                            <span className="text-sm font-bold text-slate-900 border border-slate-300 rounded px-2 py-1">
                                ₴ {rec.suggested_price}
                            </span>
                            <button
                                onClick={() => { setAccepted(true); onAccept(); }}
                                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <Check size={14} />
                                Прийняти
                            </button>
                        </div>
                    )}
                    {accepted && (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
                            <Check size={14} /> Прийнято
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
