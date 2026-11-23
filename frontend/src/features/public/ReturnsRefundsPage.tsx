import { RotateCcw, Clock, CheckCircle, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ReturnsRefundsPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-8 text-cocoa">
      <div className="border-b border-[#1e2a1c]/15 pb-6">
        <span className="text-[0.7rem] uppercase tracking-widest font-bold text-terracotta block mb-1">
          CircleUp Policies
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-deep">
          Returns & Refunds Policy
        </h1>
        <p className="mt-2 text-xs text-cocoa/70">
          Last updated: December 2026 • Fair, clear, and sustainable return policies.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Clock className="size-4 text-forest" />
            1. 7-Day Pre-Loved Return Window
          </h2>
          <p>
            We want you to love what you wear. If an item does not fit or differs significantly from the catalog description and measurements, you may request a return within <strong>7 days</strong> of delivery receipt.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <RotateCcw className="size-4 text-forest" />
            2. Condition & Inspection Criteria
          </h2>
          <p>
            To qualify for a refund, returned garments must be in the exact condition received: unworn outside of initial trying on, unwashed, unaltered, and with any CircleUp studio tags intact. Because vintage pieces are unique, each return undergoes inspection upon receipt at our studio.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <CheckCircle className="size-4 text-forest" />
            3. Refund Processing & Timelines
          </h2>
          <p>
            Once your returned item is inspected and approved by our team, refunds are initiated within 48 hours to your original mode of payment or designated UPI VPA. Depending on banking channels, funds typically credit in 3 to 5 business days. You will receive an automated email notification confirming the refund details and monetary amount.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <ShieldAlert className="size-4 text-forest" />
            4. Non-Returnable Items
          </h2>
          <p>
            Rental statements past their active booking window and specially altered or customized pieces are non-returnable unless arrived damaged in transit. For assistance with a return, visit your <Link to="/account" className="text-forest underline font-semibold">Customer Account</Link> or contact <a href="mailto:care@circleuponline.com" className="text-forest underline font-semibold">care@circleuponline.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
