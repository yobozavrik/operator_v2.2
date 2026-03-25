-- Schedule the nightly refresh for Craft Bakery Analytics
-- This will run every day at 03:00 AM
SELECT cron.schedule(
    'refresh-craft-bakery-analytics', -- unique job name
    '0 3 * * *',                      -- cron schedule (03:00 every day)
    'SELECT bakery1.f_craft_nightly_refresh_and_alerts();'
);

-- Note: To see active jobs, run: SELECT * FROM cron.job;
-- Note: To unschedule, run: SELECT cron.unschedule('refresh-craft-bakery-analytics');
