-- ==============================================================================
-- CircleUp Security Hardening Migration: Phase 1 Conditional RPC Cleanup
-- Migration: 20261211000000_conditional_drop_legacy_rpcs.sql
--
-- Purpose:
--   STEP 2: CONDITIONAL DROP OF OBSOLETE PRIVILEGED FUNCTION OVERLOADS.
--
-- IMPORTANT SAFETY NOTICE / PREREQUISITE:
--   DO NOT EXECUTE THIS MIGRATION UNTIL THE CLIENT HAS RUN THE READ-ONLY
--   VERIFICATION QUERIES (DOCUMENTED IN THE PHASE 1 REPORT) AND RETURNED WRITTEN
--   CONFIRMATION THAT NO EXTERNAL SCHEDULER (PG_CRON), SUPABASE SCHEDULED FUNCTION,
--   EDGE FUNCTION, DATABASE WEBHOOK, BI TOOL, OR LEGACY REPOSITORY INTEGRATION
--   INVOKES THESE EXACT SIGNATURES.
--
-- Assumptions:
--   - Step 1 (Revocation of public/anon/authenticated permissions) has already been applied
--     via migration 20261210000000.
--   - Only service_role can currently execute these overloads.
--
-- Rollback Note:
--   To restore these overloads if an unexpected dependency arises, execute the corresponding
--   CREATE OR REPLACE FUNCTION statements recorded in migration 20261207000000.
-- ==============================================================================

-- 1. Drop 4-parameter legacy overload of storefront_verify_razorpay_payment
-- Replaced by 6-parameter version requiring verified amount in paise
-- drop function if exists public.storefront_verify_razorpay_payment(text, text, text, text);

-- 2. Drop 9-parameter legacy overload of admin_process_order_refund
-- Replaced by 10-parameter version requiring settlement reference and idempotency key
-- drop function if exists public.admin_process_order_refund(text, bigint, text, text, text, text, text, text, text);

-- 3. Drop legacy overload of admin_mark_order_payment_received (without confirmed amount)
-- drop function if exists public.admin_mark_order_payment_received(text, text, text, text, text, text, text, text);

DO $$
BEGIN
  RAISE NOTICE 'Migration 20261211000000_conditional_drop_legacy_rpcs.sql is INERT pending external verification and explicit client sign-off.';
  RAISE NOTICE 'Obsolete overloads remain revoked from public/anon/authenticated in migration 20261210000000.';
  RAISE NOTICE 'To execute drops after verification, uncomment the DROP FUNCTION statements in this migration.';
END $$;
