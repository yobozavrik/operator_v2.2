GRANT USAGE ON SCHEMA pizza1 TO authenticated;
GRANT USAGE ON SCHEMA pizza1 TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pizza1.customer_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pizza1.customer_reservation_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pizza1.customer_reservations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pizza1.customer_reservation_items TO service_role;
