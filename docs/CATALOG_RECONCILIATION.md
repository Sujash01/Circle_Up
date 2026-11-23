# Catalog Reconciliation: 45-Row CSV vs 48-Product Database

## Summary

This document explains and reconciles the count difference between the canonical product CSV (`circleup_final_45_products.csv`) and the 48 products present in the initial database and test seeds.

## Data Sources

1. **`circleup_final_45_products.csv`**:
   - Contains exactly **45 data rows** (46 lines including the CSV header).
   - Represents the physical inventory audited, measured, and photographed during initial launch preparation.
   - Sourced with Google Drive image references, category codes (`W`, `MS`, `SET`, `R`, `DB`, `SB`, etc.), and retail prices in INR (e.g. `550`, `350`, `800`, `150`).
   - Sized with detailed bust/waist/shoulder/length measurements.

2. **Database & Seed Catalog (48 Items)**:
   - Contains **48 products**.
   - Includes all 45 physical inventory items from `circleup_final_45_products.csv` converted to non-negative integer paise (e.g., ₹550 -> `55000` paise).
   - Plus **3 additional studio showcase and rental statement pieces**:
     1. `retro-gum-sole-court-trainers` (Footwear category)
     2. `heritage-shawl-and-sheer-stockings` (Accessories category)
     3. `curated-socks-keychain-nails` (Finishing Details bundle)
   - These 3 pieces were created directly in the studio design showcase to populate the Footwear and Accents discovery rails during storefront layout verification.

## Monetary Verification

- All 45 items in the CSV have their retail prices mapped strictly to integer paise:
  $$\text{price}_{\text{paise}} = \text{round}(\text{price}_{\text{INR}} \times 100)$$
- Zero floating-point rounding errors exist in database documents, RPCs, or shared schemas.
- `MONETARY_RECONCILIATION_VERIFIED` in `backend/src/config/env.ts` defaults safely to `false` until verified against live production database records.

## Verification Tool

Run the standalone verification script at any time:

```powershell
node scripts/verify-catalog-count.mjs
```
