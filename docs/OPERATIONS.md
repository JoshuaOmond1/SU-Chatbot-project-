# Operations runbook outline

## Deploy

Apply `backend/migrations/001_initial.sql`, configure production environment values
from the secret manager, set `USE_DATABASE=true`, deploy multiple API replicas, then
publish the web component and Flutter package through their normal SU release trains.
Run smoke tests using a synthetic student account before shifting traffic.

## Roll back

Keep the previous API/container and client assets addressable. Disable chat at the
host feature flag first, route API traffic back, and deactivate newly ingested chunks
instead of deleting them. Database migrations in this reference are additive.

## Dependency degradation

- Identity unavailable: reject new exchanges; existing short-lived tokens expire.
- AMS unavailable: answer only from public approved sources; never infer personal state.
- Model unavailable: return a neutral retry/escalation message; do not expose provider errors.
- Vector store unavailable: fail closed for university-specific facts.

## Incident response

Disable the feature flag/model egress, preserve audit evidence, rotate affected keys,
notify security/DPO, identify impacted subjects and data, and follow the university's
breach and student communications process. Re-enable only after documented validation.
