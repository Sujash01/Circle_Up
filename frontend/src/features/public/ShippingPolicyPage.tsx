import { Truck, MapPin, Gift, Clock } from 'lucide-react';
import { formatPrice } from '@circleup/shared';

export function ShippingPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-8 text-cocoa">
      <div className="border-b border-[#1e2a1c]/15 pb-6">
        <span className="text-[0.7rem] uppercase tracking-widest font-bold text-terracotta block mb-1">
          CircleUp Policies
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-deep">
          Shipping & Delivery Policy
        </h1>
        <p className="mt-2 text-xs text-cocoa/70">
          Last updated: December 2026 • Pan-India deliveries packaged sustainably.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Gift className="size-4 text-forest" />
            1. Free Shipping & Delivery Rates
          </h2>
          <p>
            We offer <strong>Free Standard Shipping</strong> across India on all shopping bags totaling <strong>{formatPrice(150000)}</strong> (1,500 INR) or more. For orders below this threshold, a flat delivery fee of <strong>{formatPrice(9000)}</strong> (90 INR) applies nationwide.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Clock className="size-4 text-forest" />
            2. Dispatch & Delivery Estimates
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-cocoa/85">
            <li><strong>Processing:</strong> Orders are hand-packed at our studio within 24 to 48 business hours after order verification.</li>
            <li><strong>Metro Cities:</strong> Delivery typically arrives within 3 to 5 business days following dispatch.</li>
            <li><strong>Rest of India:</strong> Delivery typically arrives within 5 to 7 business days depending on local courier coverage.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Truck className="size-4 text-forest" />
            3. Order Tracking
          </h2>
          <p>
            As soon as your package is dispatched with our courier partner, you will receive an email update with your official tracking number and carrier link. You can also view live fulfillment progress anytime from the <a href="/account" className="text-forest underline font-semibold">Customer Portal</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <MapPin className="size-4 text-forest" />
            4. Eco-Friendly Packaging
          </h2>
          <p>
            Every CircleUp order is packaged using plastic-free, recyclable paper wrap and recycled cardboard mailers, honoring our core mission to minimize textile and shipping waste.
          </p>
        </section>
      </div>
    </div>
  );
}
