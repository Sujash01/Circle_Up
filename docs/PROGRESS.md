# CircleUp Session 1 Progress — Backend Rebuild & Unification

## Checklist

- [x] **Phase 0: Rules and Audit**
  - [x] Create `AGENTS.md` with permanent project rules.
  - [x] Perform comprehensive audit of frontend data needs, backend state, contracts, build status, and git tracking.
  - [x] Write `docs/AUDIT.md`.
  - [x] Run typecheck, lint, tests and commit `session1 phase 0: rules and audit`.

- [x] **Phase 1: Build Health and Shared Contract**
  - [x] Fix workspace build order so shared builds first (`build:shared`, `dev`, `seed`, `test`, `build`).
  - [x] Verify `backend/.env` git tracking; if tracked, untrack with `git rm --cached`, add to `.gitignore`, keep `.env.example`.
  - [x] Add Zod schemas and inferred types in `/shared`:
    - `Product`, `ProductImage`, `Category`, `Collection`, `Coupon`, `Order`, `OrderItem`, `CartItem`, `RentalItem`, `StoreEvent`, `SiteSettings`, `AdminUser`.
    - Pagination envelope and error shape `{ error: { code, message } }`.
  - [x] Document integer money format (paise integer storage) and add `formatPrice()` with unit test.
  - [x] Fix backend lint errors and `CartPage.tsx` lint/type errors at root cause.
  - [x] Run typecheck, lint, tests and commit `session1 phase 1: build health and shared contract`.

- [x] **Phase 2: Backend Rebuilt Around the Frontend**
  - [x] Structure backend: `routes -> controllers -> services -> repositories`, async error middleware, request IDs.
  - [x] Implement public REST API:
    - Products (filters, sort, pagination default 12/max 48, by slug, related; published & non-deleted only).
    - Unified homepage endpoint `GET /api/homepage` (collection rows, 4–6 chest picks, 4 category tiles, announcement text, marquee phrases, site settings).
    - Categories & collections endpoints (`/api/categories`, `/api/collections`).
    - Rentals and events/store endpoints (`/api/rentals`, `/api/events`).
    - Coupons validation endpoint (`THRIFT10`, `CIRCLE20`, min cart, expiry, usage limit).
    - Cart, wishlist, and checkout endpoints (server-side price recomputation & atomic stock decrement).
  - [x] Search endpoint `GET /api/search?q=&limit=&page=` (case/diacritic insensitive, ranked name prefix > name contains > tags/category, min 2 chars, suggestions mode max 6).
  - [x] Quality & security: Helmet, CORS from env, compression, rate limits, ETag & Cache-Control (stale-while-revalidate for catalog), database indexes, no N+1 queries, clean error responses without stack traces.
  - [x] Idempotent `npm run seed` with working slugs, resolving local image paths, categories, collections, chest picks, rentals, events, coupons, settings; zero model/person photos.
  - [x] Supertest contract tests for every public endpoint (`phase2Endpoints.test.ts`).
  - [x] Run typecheck, lint, tests and commit `session1 phase 2: backend rebuilt around the frontend`.

- [x] **Phase 3: Admin Backend (/api/admin/*)**
  - [x] Admin auth: Argon2id password hashing, HttpOnly + Secure + SameSite session cookie with refresh rotation, CSRF protection on state-changing requests, login rate limiting and lockout, logout, change password.
  - [x] CLI setup `npm run admin:create` (first owner creation, refuses if owner exists unless `--force`).
  - [x] Role-based access control: `owner` (full access), `staff` (products and orders only). No cache headers on admin routes.
  - [x] Product management: CRUD, status (`draft`, `published`, `archived`), auto slug generator, sizes & stock, compare-at price, tags, condition, badge, SKU, SEO, chest-pick & featured flags, duplicate, bulk actions, soft delete & restore, deletion block if in order, immutable order snapshot.
  - [x] Media handling: multi-upload endpoint, real MIME verification, <= 8MB, EXIF strip, Sharp WebP resizing (400/800/1600), content-hash filenames, storage interface (local disk dev & S3-compatible production).
  - [x] Management modules: Collections and tiles (chest picks 4-6), orders (validated status transitions, stock restore on cancel), rentals & events editing, coupons CRUD, site settings (owner-only), audit logging.
  - [x] Content version key bumped on every admin mutation.
  - [x] Comprehensive admin test suite (`adminBackend.test.ts`).
  - [x] Run typecheck, lint, tests and commit `session1 phase 3: admin backend`.

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

### Phase 1: Build Health and Shared Contract (Completed)
- Configured root script `build:shared` and updated `scripts/dev.mjs` to compile shared schemas before starting dev processes.
- Untracked `backend/.env` from git (`git rm --cached`), verified `.gitignore`, and completed `backend/.env.example`.
- Created comprehensive Zod schemas and inferred types in `@circleup/shared`: `Product`, `ProductImage`, `ProductVariant`, `Category`, `Collection`, `Coupon`, `Order`, `OrderItem`, `CartItem`, `RentalItem`, `StoreEvent`, `SiteSettings`, `AdminUser`, `PaginationMeta`, and `ApiErrorResponse`.
- Implemented `formatPrice()` with non-negative integer paise specification in `/shared` and added test suite in `frontend/tests/formatPrice.test.ts`.
- Resolved all 5 backend unused variable ESLint errors and fixed `CartPage.tsx` `PaymentMethod` type guard.
- Typecheck, ESLint, and all 20 tests pass cleanly across monorepo.

### Phase 2: Backend Rebuilt Around the Frontend (Completed)
- Restructured layered backend: `routes -> controllers -> services -> repositories` with async error handling and request correlation IDs.
- Implemented public endpoints mounted on both `/api` and `/api/v1`:
  - `GET /homepage`: Unified homepage payload (Ready-To-Wear, Handbags, Winter rows, 4–6 chest picks with custom card backgrounds, 4 category tiles, announcement text, marquee phrases, site settings).
  - `GET /search`: Case/diacritic insensitive ranked search (name prefix > name contains > tags/category) with min 2 chars guard and 6-item suggestions mode.
  - `POST /coupons/validate`: Real-time validation for launch coupons `THRIFT10` and `CIRCLE20` with min order thresholds and discount calculations.
  - `GET /categories` & `GET /collections`: Curated directories with live product counts.
  - `GET /rentals`: Curated rental rails with integer paise prices and security deposits.
  - `GET /events`: Pop-up and swap meet community schedules.
  - `GET /products/:identifier/related`: Related items filtered by category excluding the target item.
  - `POST /orders`: Server-side price recomputation, coupon application, and stock management.
- Added production middleware: `compression()`, `helmet()`, ETag, `cacheCatalogReads` (`max-age=60, stale-while-revalidate=300`), and `noStoreCache` for checkout/coupons.
- Enhanced `npm run seed` to idempotently upsert products, launch coupons, rentals, events, and site settings.
- Wrote 14 new Supertest contract tests in `phase2Endpoints.test.ts` (all 26 backend tests + 20 frontend tests = 46 passing tests).

### Phase 3: Admin Backend (/api/admin/*) (Completed)
- Implemented secure admin authentication:
  - Argon2id password hashing and verification.
  - HttpOnly, Secure, SameSite `admin_session` cookie signed via HMAC SHA-256.
  - Double-submit CSRF protection with `X-CSRF-Token` required on all state-changing mutations.
  - Login rate limiter and 5-attempt failed login lockout (15 minutes).
  - CLI script `npm run admin:create` with `--force` protection preventing duplicate owners.
- Implemented Role-Based Access Control (`owner` vs `staff`):
  - `owner`: full privileges including site settings, permanent deletions, and coupon management.
  - `staff`: product catalog and order processing only.
  - All admin routes enforce `noStoreCache`.
- Implemented Product Management:
  - Full CRUD with automated slug and serial number generator.
  - Product duplication creates draft copy with `(Copy)` suffix.
  - Bulk actions (`publish`, `unpublish`, `archive`, `changeCategory`, `delete`).
  - Soft delete with `deletedAt` timestamp; permanent deletion strictly blocked if product exists in customer order history.
- Implemented Media Upload Pipeline:
  - Multi-upload endpoint via `multer` memory storage.
  - True MIME format verification via Sharp (accepts genuine JPEG, PNG, WebP; rejects spoofed buffers).
  - EXIF metadata stripping and WebP generation in 3 standard widths (400w, 800w, 1600w).
  - Content-hashed filenames (`sha256(buffer).slice(0, 16)`).
- Implemented Order & Management Modules:
  - Order status transitions following strict finite state machine (`PENDING -> CONFIRMED -> SHIPPED -> DELIVERED`).
  - Transitioning to `CANCELLED` atomically restores item stock.
  - Audit logging system tracking actor, role, action, target entity, diff, and IP (`AuditLog.ts`).
  - Content version key bumped on every admin mutation.
- Wrote 19 new integration tests in `adminBackend.test.ts` (all 45 backend tests + 20 frontend tests = 65 passing tests).



