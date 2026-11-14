# CircleUp Session 1 Progress — Backend Rebuild & Unification

## Checklist

- [x] **Phase 0: Rules and Audit**
  - [x] Create `AGENTS.md` with permanent project rules.
  - [x] Perform comprehensive audit of frontend data needs, backend state, contracts, build status, and git tracking.
  - [x] Write `docs/AUDIT.md`.
  - [x] Run typecheck, lint, tests and commit `session1 phase 0: rules and audit`.

- [ ] **Phase 1: Build Health and Shared Contract**
  - [ ] Fix workspace build order so shared builds first (`build:shared`, `dev`, `seed`, `test`, `build`).
  - [ ] Verify `backend/.env` git tracking; if tracked, untrack with `git rm --cached`, add to `.gitignore`, keep `.env.example`.
  - [ ] Add Zod schemas and inferred types in `/shared`:
    - `Product`, `ProductImage`, `Category`, `Collection`, `Coupon`, `Order`, `OrderItem`, `CartItem`, `RentalItem`, `StoreEvent`, `SiteSettings`, `AdminUser`.
    - Pagination envelope and error shape `{ error: { code, message } }`.
  - [ ] Document integer money format (paise integer storage) and add `formatPrice()` with unit test.
  - [ ] Fix backend lint errors and `CartPage.tsx` lint/type errors at root cause.
  - [ ] Run typecheck, lint, tests and commit `session1 phase 1: build health and shared contract`.

- [ ] **Phase 2: Backend Rebuilt Around the Frontend**
  - [ ] Structure backend: `routes -> controllers -> services -> repositories`, async error middleware, request IDs.
  - [ ] Implement public REST API:
    - Products (filters, sort, pagination default 12/max 48, by slug, related; published & non-deleted only).
    - Unified homepage endpoint `GET /api/homepage` (collection rows, 4–6 chest picks, 4 category tiles, announcement text, marquee phrases, site settings).
    - Categories & collections endpoints.
    - Rentals and events/store endpoints.
    - Coupons validation endpoint (`THRIFT10`, `CIRCLE20`, min cart, expiry, usage limit).
    - Cart, wishlist, and checkout endpoints (server-side price recomputation & atomic stock decrement).
  - [ ] Search endpoint `GET /api/search?q=&limit=&page=` (case/diacritic insensitive, ranked name prefix > name contains > tags/category, min 2 chars, suggestions mode max 6).
  - [ ] Quality & security: Helmet, CORS from env, compression, rate limits, ETag & Cache-Control (stale-while-revalidate for catalog), database indexes, no N+1 queries, clean error responses without stack traces.
  - [ ] Idempotent `npm run seed` with working slugs, resolving local image paths, categories, collections, chest picks, rentals, events, coupons, settings; zero model/person photos.
  - [ ] Supertest contract tests for every public endpoint.
  - [ ] Run typecheck, lint, tests and commit `session1 phase 2: backend rebuilt around the frontend`.

- [ ] **Phase 3: Admin Backend (/api/admin/*)**
  - [ ] Admin auth: Argon2id password hashing, HttpOnly + Secure + SameSite session cookie with refresh rotation, CSRF protection on state-changing requests, login rate limiting and lockout, logout, change password.
  - [ ] CLI setup `npm run admin:create` (first owner creation, refuses if owner exists unless `--force`).
  - [ ] Role-based access control: `owner` (full access), `staff` (products and orders only). No cache headers on admin routes.
  - [ ] Product management: CRUD, status (`draft`, `published`, `archived`), auto slug generator, sizes & stock, compare-at price, tags, condition, badge, SKU, SEO, chest-pick & featured flags, duplicate, bulk actions, soft delete & restore, deletion block if in order, immutable order snapshot.
  - [ ] Media handling: multi-upload endpoint, real MIME verification, <= 8MB, EXIF strip, Sharp WebP resizing (400/800/1600), content-hash filenames, reorder/cover/alt text, storage interface (local disk dev & S3-compatible production).
  - [ ] Management modules: Collections and tiles (chest picks 4-6), orders (validated status transitions, stock restore on cancel), rentals & events editing, coupons CRUD, site settings (owner-only), audit logging.
  - [ ] Content version key bumped on every admin mutation.
  - [ ] Comprehensive admin test suite.
  - [ ] Run typecheck, lint, tests and commit `session1 phase 3: admin backend`.

- [ ] **End of Session 1: Verification & Handoff**
  - [ ] Root install, typecheck, lint, test, and build passing.
  - [ ] Start backend and frontend together and verify live API connection.
  - [ ] Record final summary and commit.

---
## Phase Execution Log

### Phase 0: Rules and Audit (Completed)
- Created permanent rules in `AGENTS.md`.
- Audited all frontend data needs, backend state, contracts, test/build status, and git tracking in `docs/AUDIT.md`.
- Verified typecheck, test suites, and build across `@circleup/shared`, `@circleup/backend`, and `@circleup/frontend`.
- Discovered 5 backend unused variable lint errors and identified `backend/.env` git tracking to fix in Phase 1.

