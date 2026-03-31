import Link from 'next/link';
import { ChevronRight, MapPinned } from 'lucide-react';

const STORES = [
    { slug: 'graviton', label: 'Гравітон' },
    { slug: 'sadgora', label: 'Садгора' },
    { slug: 'kompas', label: 'Компас' },
    { slug: 'ruska', label: 'Руська' },
    { slug: 'hotynska', label: 'Хотинська' },
    { slug: 'biloruska', label: 'Білоруська' },
    { slug: 'kvarc', label: 'Кварц' },
];

export default function GravitonStoresIndexPage() {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    <MapPinned size={12} />
                    Магазини
                </div>
                <h2 className="mt-3 text-2xl font-bold text-slate-900">Магазини мережі</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Відкрий конкретну точку, щоб побачити критичні категорії, позиції та обсяг до заявки без переходу через загальний overview.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {STORES.map((store) => (
                    <Link
                        key={store.slug}
                        href={`/graviton/stores/${store.slug}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-white"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Точка мережі</div>
                                <div className="mt-2 text-lg font-bold text-slate-900">{store.label}</div>
                                <div className="mt-2 text-sm leading-6 text-slate-600">Відкрити дефіцити точки, категорії ризику та список позицій.</div>
                            </div>
                            <ChevronRight size={18} className="text-slate-400" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
