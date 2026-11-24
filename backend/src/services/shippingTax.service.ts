import { calculateCheckoutDeliveryFee, CHECKOUT_SHIPPING } from '@circleup/shared';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';

export interface ShippingZone {
  id: string;
  name: string;
  pincodes: string[];
  ratePaise: number;
  freeShippingAbovePaise: number | null;
  isActive: boolean;
}

export interface TaxSettings {
  id: string;
  mode: 'INCLUSIVE' | 'EXCLUSIVE';
  gstSlabPercent: number;
  hsnCode: string;
}

export const shippingTaxService = {
  async getShippingZones(): Promise<ShippingZone[]> {
    if (!isSupabaseConfigured()) {
      return [
        {
          id: 'default',
          name: 'Standard Pan-India',
          pincodes: [],
          ratePaise: CHECKOUT_SHIPPING.standardFeePaise,
          freeShippingAbovePaise: CHECKOUT_SHIPPING.freeThresholdPaise,
          isActive: true,
        },
      ];
    }
    const { data, error } = await getSupabaseAdminClient()
      .from('shipping_zones')
      .select('*')
      .eq('is_active', true);

    if (error || !data || data.length === 0) {
      return [
        {
          id: 'default',
          name: 'Standard Pan-India',
          pincodes: [],
          ratePaise: CHECKOUT_SHIPPING.standardFeePaise,
          freeShippingAbovePaise: CHECKOUT_SHIPPING.freeThresholdPaise,
          isActive: true,
        },
      ];
    }

    return data.map((z) => ({
      id: String(z.id),
      name: String(z.name),
      pincodes: Array.isArray(z.pincodes) ? z.pincodes : [],
      ratePaise: CHECKOUT_SHIPPING.standardFeePaise,
      freeShippingAbovePaise: CHECKOUT_SHIPPING.freeThresholdPaise,
      isActive: Boolean(z.is_active),
    }));
  },

  calculateDeliveryFee(discountedSubtotalInPaise: number, itemCount: number) {
    return {
      deliveryFeePaise: calculateCheckoutDeliveryFee(discountedSubtotalInPaise, itemCount),
      freeShippingThresholdPaise: CHECKOUT_SHIPPING.freeThresholdPaise,
      zoneName: 'Standard Pan-India',
    };
  },

  async getTaxSettings(): Promise<TaxSettings> {
    if (!isSupabaseConfigured()) {
      return { id: 'default', mode: 'INCLUSIVE', gstSlabPercent: 5.0, hsnCode: '6204' };
    }
    const { data } = await getSupabaseAdminClient().from('tax_settings').select('*').limit(1).maybeSingle();
    if (!data) {
      return { id: 'default', mode: 'INCLUSIVE', gstSlabPercent: 5.0, hsnCode: '6204' };
    }
    return {
      id: String(data.id),
      mode: data.mode === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE',
      gstSlabPercent: Number(data.gst_slab_percent) || 5.0,
      hsnCode: String(data.hsn_code || '6204'),
    };
  },
};
