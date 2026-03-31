export type SKUCategory =
    | 'ВАРЕНИКИ' | 'ПЕЛЬМЕНІ' | 'ХІНКАЛІ' | 'ЧЕБУРЕКИ'
    | 'КОВБАСКИ' | 'ГОЛУБЦІ' | 'КОТЛЕТИ' | 'СИРНИКИ'
    | 'ФРИКАДЕЛЬКИ' | 'ЗРАЗИ' | 'ПЕРЕЦЬ ФАРШИРОВАНИЙ' | 'МЛИНЦІ' | 'БЕНДЕРИКИ' | 'ПІЦА' | 'ФЛОРИДА' | 'БУЛЬВАР-АВТОВОКЗАЛ' | 'Інше';

export type PriorityKey = 'critical' | 'high' | 'reserve' | 'normal';

export interface SupabaseDeficitRow {
    код_магазину: number;
    назва_магазину: string;
    код_продукту: number;
    назва_продукту: string;
    category_name: string;
    current_stock: number;
    min_stock: number;
    deficit_kg: number;
    recommended_kg: number;
    avg_sales_day: number;
    deficit_percent: number;
    priority: 'critical' | 'high' | 'reserve' | 'normal';  // ✅ String type
    priority_number: 1 | 2 | 3 | 4;  // ✅ Original number
    portion_size?: number;
    portion_unit?: string;
    is_live?: boolean;
    today_production?: number;
}

export interface Store {
    storeId: number;
    storeName: string;
    currentStock: number;
    minStock: number;
    deficitKg: number;
    recommendedKg: number;
    avgSales: number;
    distributionPlan?: number;
    unit?: 'шт' | 'кг';
    isLive?: boolean;
}

export interface ProductionTask {
    id: string;
    productCode: number;
    name: string;
    category: SKUCategory;
    totalStockKg: number;
    dailyForecastKg: number;
    minStockThresholdKg: number;
    outOfStockStores: number;
    salesTrendKg: number[];
    stores: Store[];
    recommendedQtyKg: number;
    priority: PriorityKey;
    priorityReason: string;
    storeName?: string;
    status: 'pending' | 'in-progress' | 'completed';
    timeStarted?: number;
    todayProduction?: number;
    deficitPercent: number;
    totalDeficitKg?: number;
    unit?: 'шт' | 'кг';
    portion_size?: number;
    portion_unit?: string;
}

export interface CategoryGroup {
    categoryName: string;
    emoji: string;
    totalKg: number;
    itemsCount: number;
    items: ProductionTask[];
}

export interface PriorityHierarchy {
    key: PriorityKey;
    label: string;
    emoji: string;
    color: string;
    colorDark?: string;
    glow?: string;
    totalKg: number;
    categoriesCount: number;
    categories: CategoryGroup[];
}

export interface BI_Metrics {
    shopLoad: number;
    staffCount: number;
    criticalSKU: number;
    highSKU: number;
    reserveSKU: number;
    criticalWeight: number;
    highWeight: number;
    reserveWeight: number;
    totalSKU: number;
    aiEfficiency: number;
    lastUpdate: string;
}
