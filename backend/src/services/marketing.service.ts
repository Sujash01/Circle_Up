import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';
import { BadRequestError, ServiceUnavailableError } from '../errors/AppError.js';

export const marketingService = {
  async subscribeNewsletter(input: {
    email: string;
    name?: string;
    source?: string;
    consent?: boolean;
    ipAddress?: string;
  }) {
    const cleanEmail = (input.email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleanEmail)) {
      throw new BadRequestError('A valid email address is required.', 'INVALID_EMAIL');
    }
    if (input.consent === false) {
      throw new BadRequestError('Marketing consent is required to subscribe.', 'CONSENT_REQUIRED');
    }

    if (!isSupabaseConfigured()) {
      return { success: true, message: 'Subscribed successfully.' };
    }

    const { error } = await getSupabaseAdminClient().from('newsletter_subscriptions').upsert(
      {
        email: cleanEmail,
        name: input.name?.trim() || null,
        source: input.source?.trim() || 'exit_intent',
        consent: true,
        consent_at: new Date().toISOString(),
        unsubscribed: false,
        unsubscribed_at: null,
        ip_address: input.ipAddress || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );

    if (error) {
      throw new ServiceUnavailableError(`Subscription service error: ${error.message}`, 'DATABASE_UNAVAILABLE');
    }

    return { success: true, message: 'Subscribed to CircleUp newsletter.' };
  },

  async unsubscribeNewsletter(email: string) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) throw new BadRequestError('Email address is required.', 'INVALID_EMAIL');

    if (!isSupabaseConfigured()) {
      return { success: true, message: 'Unsubscribed successfully.' };
    }

    const { error } = await getSupabaseAdminClient()
      .from('newsletter_subscriptions')
      .update({
        unsubscribed: true,
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('email', cleanEmail);

    if (error) {
      throw new ServiceUnavailableError(`Unsubscribe service error: ${error.message}`, 'DATABASE_UNAVAILABLE');
    }

    return { success: true, message: 'You have been unsubscribed from marketing emails.' };
  },

  async captureAbandonedCheckout(data: {
    cartId: string;
    customerEmail?: string;
    customerPhone?: string;
    items: unknown[];
    subtotalPaise: number;
    suggestedCouponCode?: string;
  }) {
    if (!isSupabaseConfigured()) return { success: true };
    const { error } = await getSupabaseAdminClient().from('abandoned_checkouts').upsert(
      {
        cart_id: data.cartId,
        customer_email: data.customerEmail?.trim().toLowerCase() || null,
        customer_phone: data.customerPhone?.trim() || null,
        items: data.items || [],
        subtotal_paise: data.subtotalPaise || 0,
        suggested_coupon_code: data.suggestedCouponCode || null,
      },
      { onConflict: 'cart_id' }
    );
    if (error) {
      // Non-fatal: do not block customer
      return { success: false, error: error.message };
    }
    return { success: true };
  },
};
