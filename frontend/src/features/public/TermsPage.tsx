import { BookOpen, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

export function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-8 text-cocoa">
      <div className="border-b border-[#1e2a1c]/15 pb-6">
        <span className="text-[0.7rem] uppercase tracking-widest font-bold text-terracotta block mb-1">
          CircleUp Policies
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-deep">
          Terms & Conditions
        </h1>
        <p className="mt-2 text-xs text-cocoa/70">
          Last updated: December 2026 • Governing your use of circleuponline.com.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <BookOpen className="size-4 text-forest" />
            1. Agreement to Terms
          </h2>
          <p>
            By browsing, purchasing, or registering an account on CircleUp, you agree to comply with and be bound by these Terms and Conditions. CircleUp operates as a curated online destination for authentic vintage garments, pre-loved fashion, rental statements, and handcrafted pieces.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <CheckCircle2 className="size-4 text-forest" />
            2. Unique & One-of-One Vintage Pieces
          </h2>
          <p>
            Because our collection comprises genuine vintage and thrift items, the vast majority of our catalog items are strictly one-of-one pieces with a stock quantity of one. While we thoroughly inspect, grade, steam, and describe the condition of every garment, slight signs of pre-loved character or gentle patina may be present as natural indicators of authenticity.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Scale className="size-4 text-forest" />
            3. Pricing & Integer Paise Precision
          </h2>
          <p>
            All prices on CircleUp are displayed in Indian Rupees (INR) and calculated canonically in integer paise to avoid rounding discrepancies. Prices are subject to change prior to order confirmation. Once your order is placed, the prices and discounts confirmed on your checkout summary remain fixed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <AlertTriangle className="size-4 text-forest" />
            4. Manual Payments & Order Verification
          </h2>
          <p>
            For orders placed via WhatsApp UPI or Cash on Delivery (COD), order reservations remain active for up to 24 hours while payment receipt and customer details are verified. Verification requires a valid phone number and UPI transaction reference (UTR) when applicable. Orders failing timely verification may be released back to the catalog.
          </p>
        </section>
      </div>
    </div>
  );
}
