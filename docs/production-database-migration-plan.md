# CircleUp Production Cutover Checklist

This checklist outlines the production cutover procedure. It is a planning document only; no remote database or production environment was accessed during the local migration work.

## Current application architecture

- Supabase PostgreSQL is the only application database.
- Supabase Storage is the only application-managed media provider.
- Express owns privileged database and storage operations; the service-role key must remain server-side.
- Legacy database connection configuration, startup, health checks, and runtime dependencies have been removed from the application.

## Before production cutover

1. Review and apply the repository's pending Supabase migrations through the authorized production change process. This repository task did not apply them.
2. Confirm production `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase JWT configuration, admin session secret, guest-order token secret, cookie domain, CORS origins, and frontend URL are set using the deployment secret manager.
3. Keep `MONETARY_RECONCILIATION_VERIFIED=false`. Production checkout remains gated until an independent reconciliation verifies stored product and order monetary units; do not convert or recalculate historical amounts as part of this cutover.
4. Verify production administrator provisioning, authentication, CSRF, lockout, session revocation, RLS, RPC grants, audit writes, and Storage policies using approved non-destructive checks.
5. Inventory production media URLs and confirm all referenced source images exist in the Supabase `product-images` bucket before retiring any legacy hosting or local files. The three files under `backend/public/uploads` were retained because their production references could not be checked without production access.
6. Run smoke tests for catalog, customer checkout and guest order retrieval, admin order operations, customer CRM, media upload/retrieval, and health checks.
7. Confirm backup, restore, monitoring, and incident-response procedures for the Supabase project.

## Completion criteria

- All pending migrations have been reviewed and applied by an authorized operator.
- Production environment has no legacy database variables or obsolete provider dependency.
- Production image records resolve to Supabase Storage or another explicitly retained static asset source.
- Monetary reconciliation is independently complete before enabling production checkout.
- End-to-end smoke tests pass and operational ownership is documented.
