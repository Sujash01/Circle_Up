# CircleUp Supabase Migrations Guide

## Migration History and Chronological Execution Order

Migrations in this directory are named in alphabetical / timestamp order. Supabase CLI and PostgreSQL runner execute migration scripts in filename order:

1. `20261115_create_products_schema.sql`  
   **Base Catalog & Orders Schema**: Creates `public.products`, `public.orders`, `public.order_items`, and `public.addresses`. Sets integer paise pricing checks (`price >= 0`, `total_amount >= 0`) and initial RLS.
2. `20261115_create_profiles.sql`  
   **User Profiles & Auth Trigger**: Creates `public.profiles` referencing `auth.users(id)` and sets up automatic profile provisioning on user signup.
3. `20261115_fix_rls_policies.sql`  
   **RLS Policy Remediation**: Tightens security policies on `products` and `orders`, ensuring public users can only read active products and cannot directly mutate products or orders.
4. `20261115_remove_auto_confirm.sql`  
   **Production Auth Hardening**: Drops the development auto-confirm trigger from `auth.users` to enforce real email verification.
5. `20261117_inventory_design_schema.sql`  
   **Inventory Ledger & Categories**: Sets up inventory tracking and status codes.
6. `20261120_admin_crm_full_schema.sql`  
   **Admin CRM**: Customer summaries, admin profiles, and staff RBAC.
7. `20261121_checkout_infrastructure.sql`  
   **Checkout Engine**: Idempotency keys, checkout requests, and guest order lookup tokens.
8. `20261122_checkout_atomic_rpc.sql`  
   **Atomic Checkout RPC**: `create_storefront_order_atomic` function with row locks on products.
9. `20261123_inquiries_and_storage.sql`  
   **Inquiries & Storage**: `public.inquiries` table and `product-images` storage bucket policies.
10. `20261124_site_settings_compatibility.sql`  
    **Site Settings**: Announcements, marquee phrases, and content versioning.
11. `20261125_coupon_checkout_limits.sql`  
    **Coupons**: Coupon rules (`PERCENTAGE`, `FLAT`), min cart thresholds, and usage counters.
12. `20261126_events_compatibility.sql`  
    **Events Schema**: Studio events and RSVP registration slots.
13. `20261127_rental_catalog.sql`  
    **Wardrobe Rentals**: Rental products, security deposits, and booking specs.
14. `20261128_audit_logs_compatibility.sql`  
    **Audit Logging**: `activity_audit_logs` table for administrative mutations.
15. `20261129_product_catalog_delete.sql`  
    **Product Deletion**: Soft/hard delete RPC for admin catalog management.
16. `20261130_admin_order_operations.sql`  
    **Admin Order Operations**: Order status update RPC, cancellation, and inventory restock.
17. `20261131_admin_auth_sessions.sql`  
    **Admin Auth Sessions**: Session tokens, lockout counters, and idle timeout tracking.
18. `20261201000000_preserve_catalog_status_on_order_cancel.sql`  
    **Inventory Restock State**: Preserves original catalog item status on order cancellation.
19. `20261202000000_harden_rls_and_table_grants.sql`  
    **RLS Hardening (P0-2, P1-1, P1-2)**: Revokes direct customer `INSERT` on orders, order_items, and audit logs. Restricts active coupons view to authenticated backend RPCs.
20. `20261203000000_canonical_order_statuses_and_crm_aggregations.sql`  
    **Canonical Order Statuses & CRM Aggregations (P0-3, P1-4, P1-5, P1-6)**: SQL check constraints for canonical order states, customer lifetime spend views, and database aggregates.
21. `20261204000000_user_submissions_and_distributed_rate_limiting.sql`  
    **User Submissions & Rate Limiting (P0-6, P0-7, P1-8)**: Persistent reviews, ThriftCrew submissions with moderation, rental bookings, and distributed rate limiting cache.
22. `20261205000000_p2_hardening_and_features.sql`  
    **P2 Feature Hardening**: Atomic event registration with row locks, newsletter subscribers table, order refund RPC, and fulfillment tracking RPC.
23. `20261206000000_reconcile_catalog_prices_to_paise.sql`  
    **Catalog & Rental Price Reconciliation to Integer Paise**: Converts any catalog or rental items stored in raw rupees (e.g. `price < 5000`, such as serial 160 "Latex bodysuit" entered as `700`) by multiplying `* 100` into canonical integer paise (`70000` paise = ₹700).
24. `20261207000000_enable_razorpay_checkout.sql`  
    **Razorpay Online Checkout & COD Removal**: Replaces Cash on Delivery with direct Razorpay online checkout, preserves integer paise calculations throughout, and adds atomic verification and reservation release RPCs.

## 20261115 Dependency Order Verification

The four `20261115` migrations naturally execute in correct dependency order under alphabetical collation:
`20261115_create_products_schema.sql` (defines tables) -> `20261115_create_profiles.sql` (profiles) -> `20261115_fix_rls_policies.sql` (tightens RLS on existing tables) -> `20261115_remove_auto_confirm.sql` (drops dev trigger).

In fresh environments, running migrations sequentially via `supabase db push` or `supabase migration up` succeeds cleanly without circular dependencies or missing references. For existing environments, migration history table `supabase_migrations.schema_migrations` records the applied filenames, so keeping the original filenames prevents duplicate execution.
