# AGENTS.md — Permanent CircleUp Engineering Rules

These rules apply permanently to all AI agents and contributors in every current and future session across the CircleUp repository (`/frontend`, `/backend`, `/shared`, `/scripts`, `/docs`).

---

## 1. Core Architectural Truth
- **Frontend as Source of Truth**: The frontend is the primary reference for the data, schema, attributes, and user experience the platform requires. The backend must be structured and rebuilt around the frontend's real requirements, not an outdated or divergent specification.
- **Scope Restriction**: The **Admin Dashboard** is the **ONLY** new feature to be introduced. Everything else is fix, connect, unify, and optimize. Do not invent unrelated pages, unrequested CRM workflows, or speculative features.
- **Shared Domain Contract**: Both frontend and backend consume shared contracts from `@circleup/shared` (`/shared`). Schemas must be validated with Zod, and TypeScript types must be strictly derived from these schemas.

---

## 2. Brand, Visual Design & Aesthetic Rules
- **Brand Palette & Tactile Metaphor**:
  - Warm vintage cream canvas, crumbled paper texture, deep forest ink green, warm black/cocoa, earthy terracotta/brown, muted gold tint, soft organic shapes, delicate botanical ivy branch, notebook accents.
  - **Crimson is reserved strictly for prices** (e.g., active price callouts); never use crimson as a general accent or banner color.
  - All colors, border radii, shadows, spacing scales, and typography sizes must originate directly from CSS variables in `frontend/src/styles.css`. No arbitrary off-palette hardcoded color values.
- **Imagery Rule**:
  - **Zero person/model photos anywhere** across the site, hero, products, lookbooks, or mock data.
  - Use only clean product flat-lays, hanging garments, bag/shoe/scarf/accessory close-ups, and atmospheric store/interior photos.

---

## 3. Financial Representation & Formatting
- **Paise Integer Format**:
  - All monetary values in database documents, APIs, and shared schemas must be stored and transmitted as non-negative **integers in paise** (1 INR = 100 paise) to avoid floating-point rounding errors.
- **`formatPrice()` Standard**:
  - The single official formatter `formatPrice(amountInPaise)` defined in `/shared` must be used across all interfaces.
  - Output standard: e.g. `"₹2,550"` (no space between currency symbol and amount, comma grouped thousands, no trailing `".00"` unless there are non-zero paise, rendered in tabular numerals).

---

## 4. Performance & Animation Guardrails
- **Hardware-Accelerated Animation**:
  - Animate only `transform`, `opacity`, and SVG `stroke-dashoffset`.
  - **Zero React state updates in scroll listeners or requestAnimationFrame loops**.
  - Measure layout geometry only on component mount or via `ResizeObserver`; never invoke `getBoundingClientRect()` or force reflows per scroll frame.
  - Always respect `prefers-reduced-motion` media queries.
- **Dependency Hygiene**:
  - Do not introduce heavy third-party UI libraries, large animation frameworks, or redundant styling packages. Keep the bundle lean and fast.

---

## 5. Backend Integrity, Quality & Security
- **Strict TypeScript & Zod Validation**:
  - All backend inputs (route params, query strings, request bodies) must be parsed and strictly validated with Zod.
  - Standardized error response shape across the entire API:
    ```json
    {
      "error": {
        "code": "ERROR_CODE_STRING",
        "message": "Human-readable descriptive message"
      }
    }
    ```
- **Layered Architecture**:
  - Clear separation of concerns: `routes -> controllers -> services -> repositories/models`.
  - Global asynchronous error handling middleware and request ID tagging on every request.
  - Standard production middleware: Helmet security headers, CORS restricted by environment, Gzip/Brotli compression, and tiered rate limiters (search, checkout, auth).
  - Proper caching semantics: `ETag` and `Cache-Control` (`stale-while-revalidate`) for catalog read endpoints. Admin routes must never be cached (`no-store`).
- **Secrets Management**:
  - **Never commit `.env` files or real credentials/secrets to git**.
  - All secrets and keys must be read through validated environment variables with a clean `.env.example` reference.

---

## 6. Verification & Visual Confirmation Rules
- **Non-destructive Testing**:
  - Never delete, skip, or disable tests to make a pipeline pass. If an existing test fails, identify whether code behavior or outdated test fixtures are the issue, and resolve the root cause.
- **Visual Verification**:
  - For any visual or storefront changes, open the live running site in a browser and capture screenshots. Never claim visual task completion without empirical verification.
- **Execution Checklist**:
  - Every phase must end with passing typecheck, lint, and unit tests before committing with the standardized commit message format.

