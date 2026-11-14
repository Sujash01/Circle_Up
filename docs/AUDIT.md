# CircleUp Architecture & Contract Audit

**Date**: November 14, 2026  
**Auditor**: Autonomous Senior Full-Stack Engineer  
**Scope**: Full monorepo audit (`/frontend`, `/backend`, `/shared`, `/scripts`, `/docs`) for Session 1 Backend Rebuild.

---

## 1. Frontend Data Inventory & Consumption Map

| Feature / UI Component | Data Required | Current Source | Target Backend Route |
| :--- | :--- | :--- | :--- |
| **Storefront Top Banner** | Announcement string, promo codes (`THRIFT10`, `CIRCLE20`) | Hardcoded in `StorefrontChrome.tsx` | `GET /api/homepage` (`siteSettings.announcement`) |
| **Hero 3D Treasure Chest** | 4–6 featured chest product picks (`name`, `price`, `tag`, `bg`, `img`, `to`) | Hardcoded in `TreasureChestHero.tsx` | `GET /api/homepage` (`chestPicks`) |
| **Values Marquee** | Brand value strings (`"Thrifted with care"`, etc.) | Hardcoded array in `HomePage.tsx` | `GET /api/homepage` (`marqueePhrases`) |
| **Ready-To-Wear Row** | 4 products in `womens-one-piece` / `womens-upperwear` | Hardcoded array fallback + `productService` mock data | `GET /api/homepage` (`collections.readyToWear`) |
| **Handbags Row** | 4 products in `accessories` / bags | Hardcoded array fallback + `productService` mock data | `GET /api/homepage` (`collections.handbags`) |
| **Find Your World Tiles** | 4 tiles: Rentals, Thrifted Treasure, Accessories, Social Circle | Static array in `HomePage.tsx` | `GET /api/homepage` (`categoryTiles`) |
| **Winter Collection Edit** | 4 curated lookbook images & captions | Static array in `HomePage.tsx` | `GET /api/homepage` (`collections.winter`) |
| **Browse / Catalog Rails** | Paginated products, filters (category, size, gender, price, condition) | `frontend/src/data/products.ts` | `GET /api/products` |
| **Product Detail Page** | Full product metadata, sizes, stock, images, measurements, related pieces | `productService.getProductBySlug(slug)` | `GET /api/products/:slug` |
| **Rentals Rail** | Rental garments with security deposit, rental periods (3/7/14 days) | `frontend/src/data/rentalProducts.ts` | `GET /api/rentals` |
| **Offline Events & Pop-ups** | Event dates, studio pop-up venues, registration slots | `frontend/src/data/events.ts` | `GET /api/events` |
| **Coupons & Promotions** | Discount rules (`THRIFT10` = 10% off, `CIRCLE20` = 20% off) | Local calculation in `cartService.ts` | `POST /api/coupons/validate` |
| **Search Overlay** | Live prefix/fuzzy search, suggestions (max 6 matches) | In-memory search in `productService.ts` | `GET /api/search` |
| **Cart & WhatsApp Bag** | Item list, quantities, size choices, localized currency summary | `localStorage` (`circleup_cart_v1`) | Client state + `POST /api/orders` |
| **Direct Checkout** | Customer info, shipping address, order confirmation | Form in `CartPage.tsx` posting to `/api/v1/orders` | `POST /api/orders` (with server-side recomputation & lock) |
| **Wishlist** | Bookmarked product IDs | `localStorage` (`circleup_wishlist_v1`) | Client state (persisted per session) |

---

## 2. Backend Inventory: Keep, Edit, or Replace

### Database & ORM
- **Database**: MongoDB.
- **Driver/ORM**: Mongoose 8.x.
- **Verdict**: **Keep**. Mongoose provides schema validation, middleware hooks, and aggregation pipelines, but must be paired with strict Zod validation on all controller inputs.

### Existing Routes & Controllers
- `GET /api/v1/health` -> **Keep & Edit**: Add DB ping latency, memory stats, and content version key.
- `GET /api/v1/products` -> **Edit**: Refactor to controller-service-repository pattern, enforce published-only filter on public requests, support sorting, pagination (default 12, max 48), and slug lookup.
- `GET /api/v1/products/:idOrSlug` -> **Edit**: Allow fetching either by MongoDB ObjectID or human-readable slug.
- `POST /api/v1/orders` -> **Edit**: Enforce server-side price recomputation from DB products, validate promo code in DB, decrement size-specific stock inside a MongoDB session transaction.
- `POST /api/v1/contact` -> **Edit**: Resolve unused variable linter error; store inquiries in database.

### New Routes to Introduce
- `GET /api/homepage` -> **New**: Aggregated endpoint returning collection rows, 4–6 chest picks, category tiles, marquee phrases, and announcement banner.
- `GET /api/categories` & `GET /api/collections` -> **New**: Public directory of categories and themed collections.
- `GET /api/rentals` -> **New**: Curated rental rail with duration and deposit specs.
- `GET /api/events` -> **New**: Community and offline store events list.
- `POST /api/coupons/validate` -> **New**: Server-side coupon verification.
- `GET /api/search` -> **New**: Ranked search (name prefix > name contains > tags/category) with suggestions mode.
- `/api/admin/*` -> **New**: Comprehensive admin system (Argon2id session auth, CSRF, product CRUD, multi-image upload with Sharp, order status machine, coupons, audit log).

### Existing Models & Schemas
- `Product.ts`: **Edit**. Migrate money fields to non-negative integer paise. Add compare-at price, SKU, tags, condition, sizes with per-size stock, chest-pick flag, featured flag, and soft-delete timestamp (`deletedAt`).
- `Order.ts`: **Edit**. Store prices in paise, snapshot immutable ordered item details (`name`, `price`, `image`, `size`), enforce valid state machine transitions (`PENDING -> CONFIRMED -> SHIPPED -> DELIVERED / CANCELLED`).
- `Inquiry.ts`: **Keep**.
- **New Models**:
  - `AdminUser.ts` (email, password hash, role: `owner` | `staff`, lockedUntil, failedAttempts).
  - `Coupon.ts` (code, discountType: `PERCENTAGE` | `FIXED`, value, minCartInPaise, maxDiscountInPaise, usageLimit, usageCount, expiresAt, isActive).
  - `Rental.ts` (rental specific attributes, depositInPaise, periodDays).
  - `Event.ts` (title, date, location, description, capacity, registeredCount).
  - `SiteSettings.ts` (announcementText, marqueePhrases, contentVersion).
  - `AuditLog.ts` (actorId, actorRole, action, entity, entityId, diff, timestamp).

### Environment Variables
- `NODE_ENV`: Keep.
- `PORT`: Keep (default 5001).
- `MONGODB_URI`: Keep.
- `JWT_ACCESS_SECRET`: Replace with secure session cookie secret.
- `CORS_ALLOWED_ORIGINS`: Keep.
- `FRONTEND_URL`: Keep.
- `STORAGE_DRIVER`: New (`local` for development, `s3` for production).
- `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: New for cloud image storage.

---

## 3. Contract Mismatch Analysis

1. **Monetary Value Units**:
   - *Frontend*: Uses `formatPrice(amount)` with mixed rupees and paise inputs across different static files.
   - *Backend*: Stored prices as decimal rupees (`Number`), risking floating-point arithmetic errors.
   - *Remedy*: Store and transmit **strictly integer paise** (e.g. `₹2,550` = `255000` paise) across DB, APIs, and shared schemas.
2. **Product Identification**:
   - *Frontend*: Routes link to `/product/:slug` (e.g., `/product/denim-fit-and-flare-co-ord-set`).
   - *Backend*: Historically looked up primarily by Mongo `_id` or `serialNumber`.
   - *Remedy*: Add unique indexed `slug` to Product schema and support `GET /api/products/:slug`.
3. **Cart & Order Checkout**:
   - *Frontend*: Calculates discount and totals locally on client and passes `subtotal`, `totalAmount` in body.
   - *Backend*: Blindly accepted client amounts or failed validation.
   - *Remedy*: Client sends only `items: [{ serialNumber, quantity, size }]` and `promoCode`. The server fetches live product records, computes subtotal, validates promo coupon rules, calculates delivery fee, and decrements stock atomically.
4. **Endpoint Prefix Alignment**:
   - Frontend `apiClient` defaults to `/api/v1` while Vercel proxies `/api/(.*)`.
   - *Remedy*: Mount routers at both `/api` and `/api/v1` to eliminate any routing discrepancies.

---

## 4. Build, Lint & Test Health Baseline

- **`npm run typecheck`**: **PASSED** (0 errors across `@circleup/shared`, `@circleup/backend`, `@circleup/frontend`).
- **`npm run lint`**:
  - `shared`: No linter configured (clean TypeScript strict).
  - `backend`: **FAILED** (5 errors: unused variables `sendSuccess` in `contact.routes.ts`, `IOrderDocument` in `order.service.ts`, `IProductDocument`, `ParsedPagination`, `normalizeToken` in `product.service.ts`).
  - `frontend`: **PASSED** (0 errors).
- **`npm test`**:
  - `backend`: **PASSED** (3 test files, 12 tests passed).
  - `frontend`: **PASSED** (7 test files, 18 tests passed).
- **`npm run build`**: **PASSED** (all 3 workspaces compile and bundle cleanly).

---

## 5. Security & Git Tracking Audit

- **`backend/.env` Tracking**:
  - **Status**: **Tracked in Git** (added in commit `5fb76f6`).
  - **Secret Exposure**: **NONE**. The file contains local defaults (`mongodb://127.0.0.1:27017/circleup_dev`) and generic placeholders (`replace-with-32-plus-char-customer-access-secret`).
  - **Action Required**: Run `git rm --cached backend/.env` in Phase 1, ensure `.gitignore` covers all `.env` files, and maintain `backend/.env.example`.

