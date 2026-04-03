import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://supabase.dmytrotovstytskyi.online';
const SERVICE_ROLE_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.QC9C9-CxocHb-jM-lHmXHEjEZV2hCOaSwgfxKLjKoEQ';

const sql = readFileSync('./supabase/migrations/20260403_sadova_views_1_basic.sql', 'utf8');

// Split by CREATE OR REPLACE VIEW
const allParts = sql.split(/(?=CREATE OR REPLACE VIEW )/g);
const views = allParts.filter(s => s.trim().startsWith('CREATE OR REPLACE VIEW'));

async function execSql(query) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query })
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
}

// First create functions
const f_d2 = `CREATE OR REPLACE FUNCTION sadova1.f_calculate_evening_d2()
 RETURNS TABLE(out_product_id integer, out_product_name text, out_spot_name text, out_stock_d0 numeric, out_stock_d1_evening numeric, out_allocated_qty numeric, out_stock_d2_morning numeric, out_stock_d2_evening numeric, out_avg_sales_day numeric, out_min_stock numeric, out_deficit_d2 numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order_rec RECORD;
    v_pool NUMERIC;
    v_zeros_count INT;
    v_total_need NUMERIC;
    v_remainder NUMERIC;
    v_multiplier INT;
    v_k NUMERIC;
BEGIN
    DROP TABLE IF EXISTS temp_order_d1;
    DROP TABLE IF EXISTS temp_evening_d1;
    
    CREATE TEMP TABLE temp_order_d1 AS
    SELECT product_id, product_name, final_qty 
    FROM sadova1.f_plan_production_1day()
    WHERE final_qty > 0;
    
    CREATE TEMP TABLE temp_evening_d1 AS
    SELECT 
        product_id::int,
        product_name,
        spot_name,
        FLOOR(effective_stock + 0.3)::numeric as d0_stock,
        GREATEST(0, FLOOR(effective_stock - avg_sales_day + 0.3))::numeric as d1_eve_stock,
        avg_sales_day::numeric as sales_avg,
        min_stock::numeric as norm_stock,
        0::numeric as alloc_qty
    FROM sadova1.v_sadova_stats_with_effective_stock;
    
    FOR v_order_rec IN SELECT * FROM temp_order_d1 LOOP
        v_pool := v_order_rec.final_qty;
        
        DROP TABLE IF EXISTS temp_calc;
        CREATE TEMP TABLE temp_calc AS
        SELECT 
            spot_name,
            sales_avg,
            norm_stock,
            d1_eve_stock as eff_stock,
            0::numeric as fin_qty,
            0::numeric as tmp_need
        FROM temp_evening_d1
        WHERE product_id = v_order_rec.product_id;
        
        SELECT COUNT(*) INTO v_zeros_count FROM temp_calc WHERE eff_stock <= 0;
        
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc SET fin_qty = 1 
            WHERE spot_name IN (
                SELECT spot_name FROM temp_calc 
                WHERE eff_stock <= 0 
                ORDER BY sales_avg DESC, spot_name ASC 
                LIMIT v_pool::int
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc SET fin_qty = 1 WHERE eff_stock <= 0;
            v_pool := v_pool - v_zeros_count;
        END IF;
        
        IF v_pool > 0 THEN
            UPDATE temp_calc 
            SET tmp_need = GREATEST(0, norm_stock - (eff_stock + fin_qty))
            WHERE TRUE;
            
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;
            
            IF v_total_need > 0 THEN
                IF v_pool < v_total_need THEN
                    v_k := v_pool::numeric / v_total_need::numeric;
                    UPDATE temp_calc 
                    SET fin_qty = fin_qty + FLOOR(tmp_need * v_k)
                    WHERE TRUE;
                    
                    SELECT (v_pool - SUM(FLOOR(tmp_need * v_k)))::numeric INTO v_remainder FROM temp_calc;
                    IF v_remainder > 0 THEN
                        UPDATE temp_calc SET fin_qty = fin_qty + 1 
                        WHERE spot_name IN (
                            SELECT spot_name FROM temp_calc 
                            WHERE tmp_need > 0
                            ORDER BY sales_avg DESC, spot_name ASC
                            LIMIT v_remainder::int
                        );
                    END IF;
                    v_pool := 0;
                ELSE
                    UPDATE temp_calc 
                    SET fin_qty = fin_qty + tmp_need
                    WHERE TRUE;
                    v_pool := v_pool - v_total_need;
                END IF;
            END IF;
        END IF;
        
        v_multiplier := 2;
        WHILE v_pool > 0 LOOP
            UPDATE temp_calc 
            SET tmp_need = GREATEST(0, (norm_stock * v_multiplier) - (eff_stock + fin_qty))
            WHERE TRUE;
            
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;
            
            EXIT WHEN v_total_need = 0 OR v_multiplier > 15;
            
            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;
                UPDATE temp_calc 
                SET fin_qty = fin_qty + FLOOR(tmp_need * v_k)
                WHERE TRUE;
                
                SELECT (v_pool - SUM(FLOOR(tmp_need * v_k)))::numeric INTO v_remainder FROM temp_calc;
                IF v_remainder > 0 THEN
                    UPDATE temp_calc SET fin_qty = fin_qty + 1 
                    WHERE spot_name IN (
                        SELECT spot_name FROM temp_calc 
                        WHERE tmp_need > 0
                        ORDER BY sales_avg DESC, spot_name ASC
                        LIMIT v_remainder::int
                    );
                END IF;
                v_pool := 0;
            ELSE
                UPDATE temp_calc 
                SET fin_qty = fin_qty + tmp_need
                WHERE TRUE;
                v_pool := v_pool - v_total_need;
                v_multiplier := v_multiplier + 1;
            END IF;
        END LOOP;
        
        UPDATE temp_evening_d1 e
        SET alloc_qty = c.fin_qty
        FROM temp_calc c
        WHERE e.product_id = v_order_rec.product_id
            AND e.spot_name = c.spot_name;
            
        DROP TABLE temp_calc;
    END LOOP;
    
    RETURN QUERY
    SELECT 
        e.product_id::INT,
        e.product_name::TEXT,
        e.spot_name::TEXT,
        e.d0_stock::NUMERIC,
        e.d1_eve_stock::NUMERIC,
        e.alloc_qty::NUMERIC,
        (e.d1_eve_stock + e.alloc_qty)::NUMERIC,
        GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3))::NUMERIC,
        e.sales_avg::NUMERIC,
        e.norm_stock::NUMERIC,
        GREATEST(0, e.norm_stock - GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3)))::NUMERIC
    FROM temp_evening_d1 e
    ORDER BY e.product_name, e.spot_name;
    
END;
$function$`;

const f_plan = `CREATE OR REPLACE FUNCTION sadova1.f_plan_production_1day()
 RETURNS TABLE(rank integer, product_id integer, product_name text, category_name text, daily_avg numeric, effective_stock_d0 numeric, deficit_d0 numeric, raw_need numeric, portion_size numeric, base_qty numeric, final_qty numeric, risk_index numeric, zero_shops integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_capacity CONSTANT NUMERIC := 495;
    v_running_total NUMERIC := 0;
    v_rec RECORD;
    v_remainder NUMERIC;
    v_top_product_id INT;
    v_top_portion_size NUMERIC;
BEGIN
    DROP TABLE IF EXISTS temp_sadova_order;
    
    CREATE TEMP TABLE temp_sadova_order AS
    WITH base_stats AS (
        SELECT 
            gs.product_id,
            gs.product_name,
            gs.category_name,
            SUM(gs.effective_stock) as total_stock,
            SUM(gs.avg_sales_day) as daily_avg,
            SUM(gs.min_stock) as norm_network,
            SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) as deficit,
            COUNT(*) FILTER (WHERE gs.effective_stock <= 0) as zeros
        FROM sadova1.v_sadova_stats_with_effective_stock gs
        GROUP BY gs.product_id, gs.product_name, gs.category_name
        HAVING SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) > 0
    ),
    needs AS (
        SELECT 
            bs.product_id,
            bs.product_name,
            bs.category_name,
            bs.daily_avg,
            bs.total_stock,
            bs.deficit,
            bs.deficit + bs.daily_avg as raw_need,
            ROUND(bs.daily_avg * (bs.deficit::numeric / NULLIF(bs.norm_network, 0)) * 100, 0) as risk_idx,
            bs.zeros,
            pc.portion_size,
            CEIL((bs.deficit + bs.daily_avg) / pc.portion_size) * pc.portion_size as base_qty
        FROM base_stats bs
        JOIN sadova1.production_catalog pc ON pc.product_id = bs.product_id
    ),
    ranked AS (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY n.risk_idx DESC, n.product_name)::INT as rnk,
            n.*
        FROM needs n
    )
    SELECT 
        r.rnk,
        r.product_id,
        r.product_name,
        r.category_name,
        r.daily_avg,
        r.total_stock,
        r.deficit,
        r.raw_need,
        r.portion_size,
        r.base_qty,
        0::NUMERIC as final_qty,
        r.risk_idx,
        r.zeros
    FROM ranked r
    ORDER BY r.rnk;
    
    FOR v_rec IN 
        SELECT * FROM temp_sadova_order ORDER BY rnk
    LOOP
        IF v_running_total + v_rec.base_qty <= v_capacity THEN
            UPDATE temp_sadova_order t
            SET final_qty = v_rec.base_qty
            WHERE t.product_id = v_rec.product_id;
            
            v_running_total := v_running_total + v_rec.base_qty;
        ELSE
            EXIT;
        END IF;
    END LOOP;
    
    v_remainder := v_capacity - v_running_total;
    
    IF v_remainder > 0 THEN
        SELECT t.product_id, t.portion_size 
        INTO v_top_product_id, v_top_portion_size
        FROM temp_sadova_order t
        WHERE t.final_qty > 0
        ORDER BY t.rnk
        LIMIT 1;
        
        IF v_top_product_id IS NOT NULL AND v_remainder >= v_top_portion_size THEN
            UPDATE temp_sadova_order t
            SET final_qty = t.final_qty + (FLOOR(v_remainder / v_top_portion_size) * v_top_portion_size)
            WHERE t.product_id = v_top_product_id;
        END IF;
    END IF;
    
    RETURN QUERY
    SELECT 
        t.rnk::INT,
        t.product_id::INT,
        t.product_name,
        t.category_name,
        t.daily_avg,
        t.total_stock,
        t.deficit,
        t.raw_need,
        t.portion_size,
        t.base_qty,
        t.final_qty,
        t.risk_idx,
        t.zeros::INT
    FROM temp_sadova_order t
    WHERE t.final_qty > 0
    ORDER BY t.rnk;
    
END;
$function$`;

async function applyAll() {
    console.log(`Applying ${views.length} views + 2 functions...\n`);

    // Apply functions first (they don't depend on views, but d2 needs f_plan)
    console.log('1. Creating f_plan_production_1day...');
    let r = await execSql(f_plan);
    console.log(r.ok ? '  ✅ OK' : `  ❌ ${r.status}: ${r.body.substring(0, 200)}`);

    console.log('2. Creating f_calculate_evening_d2...');
    r = await execSql(f_d2);
    console.log(r.ok ? '  ✅ OK' : `  ❌ ${r.status}: ${r.body.substring(0, 200)}`);

    // Apply all views in order
    for (let i = 0; i < views.length; i++) {
        const stmt = views[i].trim().replace(/;\s*$/, '');
        const name = stmt.match(/CREATE OR REPLACE VIEW (\S+)/)?.[1] ?? '?';
        r = await execSql(stmt);
        if (r.ok) {
            console.log(`${i + 3}. ✅ ${name}`);
        } else {
            console.log(`${i + 3}. ❌ ${name}: ${r.body.substring(0, 200)}`);
        }
    }

    console.log('\nDone!');
}

applyAll().catch(e => console.error('FATAL:', e));
