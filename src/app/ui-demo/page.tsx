'use client';

import React, { useState } from 'react';
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Package,
    Truck,
    Users,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TrendingUp,
    Factory,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ShoppingBag,
    AlertTriangle,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Clock,
} from 'lucide-react';
import {
    KPICard,
    KPIGrid,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ProgressRing,
    ProductionGoal,
    ProgressRingCard,
    AlertBanner,
    CriticalCounter,
    StatusDot,
    InlineAlert,
    SkeletonKPI,
    SkeletonTable,
    SkeletonProductCard,
    SkeletonGrid,
    useToast,
} from '@/components/ui';

export default function UIDemoPage() {
    const toast = useToast();
    const [showCritical, setShowCritical] = useState(true);

    return (
        <div className="min-h-screen bg-[#0A1931] p-8">
            <div className="max-w-7xl mx-auto space-y-12">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-3xl font-black text-white uppercase tracking-wider mb-2">
                        UI Components Demo
                    </h1>
                    <p className="text-white/40">
                        Нові компоненти для виробничого дашборду
                    </p>
                </div>

                {/* Toast Demo */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        Toast Notifications
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => toast.success('Замовлення створено', 'Успішно додано 15 позицій')}
                            className="px-4 py-2 bg-[#10B981]/20 text-[#10B981] rounded-lg font-bold text-sm hover:bg-[#10B981]/30 transition-colors"
                        >
                            Success Toast
                        </button>
                        <button
                            onClick={() => toast.error('Помилка збереження', 'Перевірте підключення до сервера')}
                            className="px-4 py-2 bg-[#EF4444]/20 text-[#EF4444] rounded-lg font-bold text-sm hover:bg-[#EF4444]/30 transition-colors"
                        >
                            Error Toast
                        </button>
                        <button
                            onClick={() => toast.warning('Низький залишок', 'Вареники: залишилось 5 кг')}
                            className="px-4 py-2 bg-[#F59E0B]/20 text-[#F59E0B] rounded-lg font-bold text-sm hover:bg-[#F59E0B]/30 transition-colors"
                        >
                            Warning Toast
                        </button>
                        <button
                            onClick={() => toast.info('Синхронізація', 'Дані оновлено о 14:32')}
                            className="px-4 py-2 bg-[#00D4FF]/20 text-[#00D4FF] rounded-lg font-bold text-sm hover:bg-[#00D4FF]/30 transition-colors"
                        >
                            Info Toast
                        </button>
                    </div>
                </section>

                {/* Alert Banners */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        Alert Banners
                    </h2>
                    <div className="space-y-3">
                        <AlertBanner
                            type="critical"
                            title="КРИТИЧНИЙ ДЕФІЦИТ"
                            description="Вареники з картоплею: залишок 0 кг у 3 магазинах"
                            pulse
                            dismissible
                            visible={showCritical}
                            onDismiss={() => setShowCritical(false)}
                            action={{
                                label: 'Переглянути',
                                onClick: () => toast.info('Відкриваю деталі...'),
                            }}
                        />
                        <AlertBanner
                            type="warning"
                            title="Увага: низька продуктивність"
                            description="Лінія №2 працює на 45% потужності"
                        />
                        <AlertBanner
                            type="info"
                            title="Нова версія доступна"
                            description="Оновлення буде встановлено автоматично о 03:00"
                        />
                        <AlertBanner
                            type="success"
                            title="План виконано!"
                            description="Денний план виробництва виконано на 105%"
                        />
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                        <CriticalCounter count={7} onClick={() => toast.warning('Відкриваю критичні позиції')} />
                        <div className="flex items-center gap-3 text-sm text-white/60">
                            <span className="flex items-center gap-2"><StatusDot status="critical" pulse /> Критичний</span>
                            <span className="flex items-center gap-2"><StatusDot status="warning" /> Увага</span>
                            <span className="flex items-center gap-2"><StatusDot status="normal" /> Норма</span>
                            <span className="flex items-center gap-2"><StatusDot status="good" /> Добре</span>
                        </div>
                    </div>
                </section>

                {/* KPI Cards */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        KPI Cards
                    </h2>
                    <KPIGrid columns={4}>
                        <KPICard
                            title="Вироблено сьогодні"
                            value="1,247"
                            unit="кг"
                            trend={12.5}
                            trendLabel="vs вчора"
                            icon={Factory}
                            color="cyan"
                        />
                        <KPICard
                            title="Відвантажено"
                            value="892"
                            unit="кг"
                            trend={-3.2}
                            trendLabel="vs вчора"
                            icon={Truck}
                            color="green"
                        />
                        <KPICard
                            title="Критичних позицій"
                            value="7"
                            trend={0}
                            icon={AlertTriangle}
                            color="red"
                            onClick={() => toast.warning('Відкриваю критичні позиції')}
                        />
                        <KPICard
                            title="Персонал на зміні"
                            value="12"
                            unit="осіб"
                            trend={8.3}
                            icon={Users}
                            color="purple"
                        />
                    </KPIGrid>
                </section>

                {/* Progress Rings */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        Progress Rings & Production Goals
                    </h2>
                    <div className="grid grid-cols-2 gap-6">
                        <ProductionGoal
                            produced={847}
                            target={1000}
                            unit="кг"
                            title="Денний план"
                        />
                        <ProductionGoal
                            produced={1050}
                            target={1000}
                            unit="кг"
                            title="Перевиконання!"
                        />
                    </div>
                    <div className="grid grid-cols-4 gap-4 mt-6">
                        <ProgressRingCard
                            value={85}
                            title="Вареники"
                            description="850 / 1000 кг"
                            color="cyan"
                        />
                        <ProgressRingCard
                            value={62}
                            title="Пельмені"
                            description="620 / 1000 кг"
                            color="amber"
                        />
                        <ProgressRingCard
                            value={100}
                            title="Хінкалі"
                            description="500 / 500 кг"
                            color="green"
                        />
                        <ProgressRingCard
                            value={35}
                            title="Чебуреки"
                            description="175 / 500 кг"
                            color="red"
                        />
                    </div>
                </section>

                {/* Skeleton Loaders */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        Skeleton Loaders
                    </h2>
                    <div className="grid grid-cols-4 gap-4">
                        <SkeletonKPI />
                        <SkeletonKPI />
                        <SkeletonKPI />
                        <SkeletonKPI />
                    </div>
                    <div className="grid grid-cols-2 gap-6 mt-4">
                        <SkeletonTable rows={4} columns={3} />
                        <SkeletonGrid count={4} columns={2} ItemComponent={SkeletonProductCard} />
                    </div>
                </section>

                {/* Inline Alerts */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-white/60 uppercase tracking-widest">
                        Inline Alerts
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        <InlineAlert type="critical" message="Критичний дефіцит у 3 магазинах" />
                        <InlineAlert type="warning" message="Термін придатності закінчується" />
                        <InlineAlert type="info" message="Оновлено 5 хв тому" />
                        <InlineAlert type="success" message="Синхронізовано успішно" />
                    </div>
                </section>
            </div>
        </div>
    );
}
