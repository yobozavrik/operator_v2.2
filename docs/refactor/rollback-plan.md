# Rollback plan for refactor pass

## Goal

Restore pre-refactor application state quickly if regression appears after deploy.

## Rollback trigger

Execute rollback immediately if at least one condition is true:

1. Any critical or blocking defect appears in core scenarios.
2. API responses diverge from expected contracts.
3. Error rate or latency increases materially versus baseline.

## Rollback procedure

1. Redeploy previous stable artifact/version from CI registry.
2. Flush application cache only if needed by deployment platform.
3. Run smoke checks on critical routes and workflows.
4. Confirm logs return to baseline.

## Expected RTO

Target: 10 to 30 minutes (depends on deployment pipeline speed).

## Data safety

No DB schema/function/policy changes were included in this refactor pass.
Rollback is application-code only.
