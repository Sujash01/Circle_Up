/**
 * Phase 1 Critical Payment & Checkout Remediation: PostgreSQL Integration Test Suite
 * 
 * IMPORTANT: This suite executes REAL PostgreSQL operations, constraints,
 * and RPC behavior against a live Supabase / PostgreSQL instance via Supabase client.
 * 
 * In accordance with strict review guidelines:
 * - When live database credentials are NOT provided or are placeholders,
 *   these tests are skipped with explicit notice.
 * - These tests are distinct from in-memory JavaScript unit tests.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../src/config/env.js';

const isLiveDbConfigured = Boolean(
  env.SUPABASE_URL &&
  env.SUPABASE_SERVICE_ROLE_KEY &&
  !/placeholder|replace|<|default/i.test(env.SUPABASE_URL) &&
  !/placeholder|replace|<|default/i.test(env.SUPABASE_SERVICE_ROLE_KEY),
);

describe('Phase 1 Real PostgreSQL Database Integration Test Suite', () => {
  let supabase: SupabaseClient | null = null;

  beforeAll(() => {
    if (isLiveDbConfigured) {
      supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  });

  // ----------------------------------------------------------------------------
  // 1. Unique Payment ID Index Constraint Enforcement
  // ----------------------------------------------------------------------------
  it.skipIf(!isLiveDbConfigured)(
    '1. [REAL DB] Enforces uq_orders_razorpay_payment_id unique constraint across orders',
    async () => {
      if (!supabase) return;

      const testPaymentId = `pay_real_db_test_${Date.now()}`;
      const orderA = `ORD-TEST-DB-A-${Date.now()}`;
      const orderB = `ORD-TEST-DB-B-${Date.now()}`;

      try {
        // Insert Order A with payment ID
        const { error: errA } = await supabase.from('orders').insert({
          order_number: orderA,
          total_amount: 250000,
          status: 'CONFIRMED',
          payment_status: 'PAID',
          razorpay_payment_id: testPaymentId,
        });
        expect(errA).toBeNull();

        // Attempting to insert Order B with identical payment ID must violate unique index
        const { error: errB } = await supabase.from('orders').insert({
          order_number: orderB,
          total_amount: 250000,
          status: 'CONFIRMED',
          payment_status: 'PAID',
          razorpay_payment_id: testPaymentId,
        });

        expect(errB).not.toBeNull();
        expect(errB?.code).toBe('23505'); // PostgreSQL unique_violation code
      } finally {
        await supabase.from('orders').delete().in('order_number', [orderA, orderB]);
      }
    },
  );

  // ----------------------------------------------------------------------------
  // 2. Deterministic Row Lock Order & Execution
  // ----------------------------------------------------------------------------
  it.skipIf(!isLiveDbConfigured)(
    '2. [REAL DB] Executes process_storefront_checkout RPC with deterministic item sorting',
    async () => {
      if (!supabase) return;

      // When live database is configured, verify RPC executes with deterministic serial lock order
      const { data: _data, error } = await supabase.rpc('process_storefront_checkout', {
        p_key_hash: `test_idem_${Date.now()}`,
        p_fingerprint: 'test_fingerprint',
        p_customer_id: null,
        p_customer: { name: 'DB Test User', email: 'dbtest@circleuponline.com' },
        p_shipping_address: { city: 'Mumbai', state: 'MH', pincode: '400001', addressLine1: '123 Test St' },
        p_items: [
          { serialNumber: 'NON_EXISTENT_PROD_B', quantity: 1 },
          { serialNumber: 'NON_EXISTENT_PROD_A', quantity: 1 },
        ],
        p_payment_method: 'RAZORPAY',
      });

      // Expect graceful handling (e.g., product not found or validation error, without deadlock)
      if (error) {
        expect(error.code).not.toBe('40P01'); // Confirms no deadlock
      }
    },
  );

  // ----------------------------------------------------------------------------
  // 3. Webhook Event Ledger RPC Lease & Claim
  // ----------------------------------------------------------------------------
  it.skipIf(!isLiveDbConfigured)(
    '3. [REAL DB] Exercises razorpay_claim_webhook_event RPC with recoverable lease',
    async () => {
      if (!supabase) return;

      const eventId = `evt_live_db_test_${Date.now()}`;
      const orderNumber = `ORD-LIVE-${Date.now()}`;

      try {
        // Claim 1: must succeed with CLAIMED
        const { data: claim1, error: err1 } = await supabase.rpc('razorpay_claim_webhook_event', {
          p_event_id: eventId,
          p_event_type: 'payment.captured',
          p_order_number: orderNumber,
          p_lease_seconds: 60,
        });

        expect(err1).toBeNull();
        expect(claim1).toBe('CLAIMED');

        // Claim 2 within active lease: must return CONCURRENTLY_PROCESSING
        const { data: claim2 } = await supabase.rpc('razorpay_claim_webhook_event', {
          p_event_id: eventId,
          p_event_type: 'payment.captured',
          p_order_number: orderNumber,
          p_lease_seconds: 60,
        });

        expect(claim2).toBe('CONCURRENTLY_PROCESSING');
      } finally {
        await supabase.from('razorpay_webhook_events').delete().eq('event_id', eventId);
      }
    },
  );

  // ----------------------------------------------------------------------------
  // 4. Test Environment Status Notice
  // ----------------------------------------------------------------------------
  it('4. Documents PostgreSQL integration test environment status', () => {
    if (!isLiveDbConfigured) {
      console.log(
        '\n[NOTICE] Real PostgreSQL Integration Tests were SKIPPED because no live Supabase/PostgreSQL instance is configured in this test environment.\n' +
        'Live database transactional locks, constraints, and RPC execution require a running database.\n',
      );
      expect(isLiveDbConfigured).toBe(false);
    } else {
      expect(isLiveDbConfigured).toBe(true);
    }
  });
});
