-- Clone the existing categories schema structure into categories_poster2.
-- This migration copies tables, views and materialized views definitions only.
-- It does not copy data. The new Poster account must sync into categories_poster2.

CREATE SCHEMA IF NOT EXISTS categories_poster2;

COMMENT ON SCHEMA categories_poster2 IS
    'Isolated clone of categories schema for the second Poster account.';

DO $$
DECLARE
    src_schema constant text := 'categories';
    dst_schema constant text := 'categories_poster2';
    r record;
    view_sql text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = src_schema
    ) THEN
        RAISE EXCEPTION 'Source schema "%" does not exist', src_schema;
    END IF;

    -- Clone base tables. Existing destination tables are kept intact.
    FOR r IN
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = src_schema
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.%I (LIKE %I.%I INCLUDING ALL)',
            dst_schema,
            r.table_name,
            src_schema,
            r.table_name
        );
    END LOOP;

    -- Clone plain views with schema references rewritten to the new schema.
    FOR r IN
        SELECT v.table_name AS view_name
        FROM information_schema.views v
        WHERE v.table_schema = src_schema
        ORDER BY v.table_name
    LOOP
        SELECT pg_get_viewdef(format('%I.%I', src_schema, r.view_name)::regclass, true)
        INTO view_sql;

        IF view_sql IS NULL THEN
            CONTINUE;
        END IF;

        view_sql := replace(view_sql, src_schema || '.', dst_schema || '.');

        EXECUTE format(
            'CREATE OR REPLACE VIEW %I.%I AS %s',
            dst_schema,
            r.view_name,
            view_sql
        );
    END LOOP;

    -- Clone materialized views, if the source schema has any.
    FOR r IN
        SELECT c.relname AS matview_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = src_schema
          AND c.relkind = 'm'
        ORDER BY c.relname
    LOOP
        SELECT pg_get_viewdef(format('%I.%I', src_schema, r.matview_name)::regclass, true)
        INTO view_sql;

        IF view_sql IS NULL THEN
            CONTINUE;
        END IF;

        view_sql := replace(view_sql, src_schema || '.', dst_schema || '.');

        IF EXISTS (
            SELECT 1
            FROM pg_matviews mv
            WHERE mv.schemaname = dst_schema
              AND mv.matviewname = r.matview_name
        ) THEN
            EXECUTE format('DROP MATERIALIZED VIEW %I.%I', dst_schema, r.matview_name);
        END IF;

        EXECUTE format(
            'CREATE MATERIALIZED VIEW %I.%I AS %s WITH NO DATA',
            dst_schema,
            r.matview_name,
            view_sql
        );
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA categories_poster2 TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA categories_poster2 TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA categories_poster2 TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA categories_poster2
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA categories_poster2
    GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
