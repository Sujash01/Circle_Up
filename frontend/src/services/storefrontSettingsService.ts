import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface HeaderPromoState {
  text: string;
  link?: string;
  ctaLabel?: string;
  code?: string;
  autoApply?: boolean;
  isActive: boolean;
}

export interface ExitIntentOfferState {
  code: string;
  headline: string;
  subtext: string;
  badgeText: string;
  discountType: string;
  discountValue: number;
}

const DEFAULT_HEADER_PROMO: HeaderPromoState = {
  text: 'Use code THRIFT10 or CIRCLE20 in bag · Plastic-free sustainable packaging on every parcel',
  link: '/new-arrivals',
  ctaLabel: 'Shop Finds',
  isActive: true,
};

const DEFAULT_EXIT_INTENT: ExitIntentOfferState = {
  code: 'THRIFT10',
  headline: 'Your next favorite find is waiting',
  subtext: 'Take a small thank-you toward something one of a kind.',
  badgeText: '10% OFF YOUR FIRST FIND',
  discountType: 'PERCENTAGE',
  discountValue: 10,
};

let cachedHeaderPromo: HeaderPromoState = { ...DEFAULT_HEADER_PROMO };
let cachedExitIntent: ExitIntentOfferState = { ...DEFAULT_EXIT_INTENT };
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Loads dynamic header promo banner from Supabase:
 * Checks coupons table with show_in_header=true first, then site_settings announcement.
 */
export async function refreshStorefrontPromos(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    // 1. Check for active coupon tagged for top header placement
    const { data: headerCoupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .eq('show_in_header', true)
      .order('header_priority', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerCoupon) {
      cachedHeaderPromo = {
        text: headerCoupon.header_banner_text || `${headerCoupon.code}: ${headerCoupon.description || 'Special Discount'}`,
        link: '/new-arrivals',
        ctaLabel: headerCoupon.header_cta_label || 'Copy Code',
        code: headerCoupon.code,
        autoApply: Boolean(headerCoupon.auto_apply),
        isActive: true,
      };
    } else {
      // 2. Fall back to site_settings announcement
      const { data: settings } = await supabase
        .from('site_settings')
        .select('announcement_text, announcement_link, is_announcement_active')
        .eq('id', 'default')
        .maybeSingle();

      if (settings) {
        cachedHeaderPromo = {
          text: settings.announcement_text || DEFAULT_HEADER_PROMO.text,
          link: settings.announcement_link || '/new-arrivals',
          ctaLabel: 'Shop Finds',
          isActive: settings.is_announcement_active !== false,
        };
      }
    }

    // 3. Check for active coupon tagged for exit-intent modal placement
    const { data: exitCoupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .eq('show_in_exit_intent', true)
      .limit(1)
      .maybeSingle();

    if (exitCoupon) {
      cachedExitIntent = {
        code: exitCoupon.code,
        headline: exitCoupon.popup_headline || DEFAULT_EXIT_INTENT.headline,
        subtext: exitCoupon.popup_subtext || DEFAULT_EXIT_INTENT.subtext,
        badgeText: exitCoupon.popup_badge_text || `${exitCoupon.discount_value}% OFF ORDER`,
        discountType: exitCoupon.discount_type || 'PERCENTAGE',
        discountValue: Number(exitCoupon.discount_value || 10),
      };
    }

    notify();
  } catch (err) {
    console.warn('Failed to refresh storefront promos from Supabase:', err);
  }
}

/**
 * Hook subscribing to live header promo updates from Supabase.
 */
export function useHeaderPromo(): HeaderPromoState {
  const [promo, setPromo] = useState<HeaderPromoState>(cachedHeaderPromo);

  useEffect(() => {
    const update = () => setPromo({ ...cachedHeaderPromo });
    listeners.add(update);
    refreshStorefrontPromos();

    // Supabase Realtime subscription to live updates
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured()) {
      channel = supabase
        .channel('public:storefront_promos')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'coupons' },
          () => refreshStorefrontPromos(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'site_settings' },
          () => refreshStorefrontPromos(),
        )
        .subscribe();
    }

    return () => {
      listeners.delete(update);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return promo;
}

/**
 * Hook subscribing to live exit-intent coupon updates from Supabase.
 */
export function useExitIntentOffer(): ExitIntentOfferState {
  const [offer, setOffer] = useState<ExitIntentOfferState>(cachedExitIntent);

  useEffect(() => {
    const update = () => setOffer({ ...cachedExitIntent });
    listeners.add(update);
    refreshStorefrontPromos();

    return () => {
      listeners.delete(update);
    };
  }, []);

  return offer;
}
