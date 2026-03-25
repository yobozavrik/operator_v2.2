-- Konditerka / category 34 (Морозиво) is sold in pieces.
-- Fix catalog unit so ERP cards and transaction-based analytics use the same source of truth.

UPDATE categories.products
SET unit = 'шт'
WHERE category_id = 34;
