create table if not exists florida1.product_packaging_config (
    product_id bigint primary key references categories.products(id) on delete cascade,
    product_name_snapshot text not null,
    is_active boolean not null default true,
    pack_weight_min_kg numeric(10,3) not null,
    pack_weight_max_kg numeric(10,3) not null,
    pack_weight_calc_kg numeric(10,3) not null,
    pack_zero_threshold_kg numeric(10,3) not null default 0.100,
    packs_rounding_mode text not null default 'ceil'
        check (packs_rounding_mode in ('ceil', 'round', 'floor')),
    notes text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint florida_product_packaging_config_weight_bounds_chk
        check (
            pack_weight_min_kg > 0
            and pack_weight_max_kg >= pack_weight_min_kg
            and pack_weight_calc_kg > 0
            and pack_zero_threshold_kg >= 0
        )
);

create index if not exists idx_florida_product_packaging_config_active
    on florida1.product_packaging_config (is_active);

grant select, insert, update, delete on florida1.product_packaging_config to service_role;
grant select on florida1.product_packaging_config to authenticated;
