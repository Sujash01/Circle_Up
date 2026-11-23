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
          ratePaise: 9000,
          freeShippingAbovePaise: 150000,
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
          ratePaise: 9000,
          freeShippingAbovePaise: 150000,
          isActive: true,
        },
      ];
    }

    return data.map((z) => ({
      id: String(z.id),
      name: String(z.name),
      pincodes: Array.isArray(z.pincodes) ? z.pincodes : [],
      ratePaise: Number(z.rate_paise) || 9000,
      freeShippingAbovePaise: z.free_shipping_above_paise !== null ? Number(z.free_shipping_above_paise) : null,
      isActive: Boolean(z.is_active),
    }));
  },

  async calculateDeliveryFee(pincode: string, subtotalInPaise: number): Promise<{ deliveryFeePaise: number; freeShippingThresholdPaise: number; zoneName: string }> {
    const zones = await this.getShippingZones();
    const cleanPin = (pincode || '').trim();

    // Match exact pincode or pincode prefix if configured
    let matchedZone = zones.find((z) => z.pincodes.some((p) => cleanPin.startsWith(p)));
    if (!matchedZone) {
      matchedZone = zones[0] || {
        id: 'default',
        name: 'Standard Delivery',
        pincodes: [],
        ratePaise: 9000,
        freeShippingAbovePaise: 150000,
        isActive: true,
      };
    }

    const freeThreshold = matchedZone.freeShippingAbovePaise ?? 150000;
    if (subtotalInPaise >= freeThreshold) {
      return { deliveryFeePaise: 0, freeShippingThresholdPaise: freeThreshold, zoneName: matchedZone.name };
    }

    return { deliveryFeePaise: matchedZone.ratePaise, freeShippingThresholdPaise: freeThreshold, zoneName: matchedZone.name };
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
