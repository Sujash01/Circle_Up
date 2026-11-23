import { ShieldCheck, Lock, Eye, FileText } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-8 text-cocoa">
      <div className="border-b border-[#1e2a1c]/15 pb-6">
        <span className="text-[0.7rem] uppercase tracking-widest font-bold text-terracotta block mb-1">
          CircleUp Policies
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-deep">
          Privacy Policy
        </h1>
        <p className="mt-2 text-xs text-cocoa/70">
          Last updated: December 2026 • Dedicated to transparent and ethical data practices.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <ShieldCheck className="size-4 text-forest" />
            1. Our Commitment to Your Privacy
          </h2>
          <p>
            At CircleUp (circleuponline.com), we believe that respect for the environment and circular fashion extends naturally to respecting your personal privacy. We collect only the information necessary to fulfill your orders, provide dedicated customer support, and communicate updates about curated pre-loved collections when you have explicitly consented.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Lock className="size-4 text-forest" />
            2. Information We Collect
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-cocoa/85">
            <li><strong>Order & Delivery Details:</strong> Your name, delivery address, postal code, contact phone number, and email address required to ship pre-loved garments and provide dispatch tracking.</li>
            <li><strong>Payment Verification:</strong> Transaction references (such as UPI UTR numbers) and payment receipts for manual WhatsApp and UPI verification. We never store debit or credit card details.</li>
            <li><strong>Account Credentials:</strong> If you register a customer account, credentials and authentication sessions are secured through Supabase Auth with industry-standard cryptographic protection.</li>
            <li><strong>Marketing Preferences:</strong> We record marketing consent only when you affirmatively opt in through newsletter subscription or checkout checkboxes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <Eye className="size-4 text-forest" />
            3. How We Use and Protect Your Data
          </h2>
          <p>
            Your information is stored in hardened, restricted databases with Row-Level Security (RLS) enforcement. We never sell, rent, or trade your contact information with external data brokers or advertising exchanges. Information is shared only with verified logistical partners strictly to fulfill physical delivery to your doorstep.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-forest-deep flex items-center gap-2">
            <FileText className="size-4 text-forest" />
            4. Your Rights & Unsubscribe
          </h2>
          <p>
            You have the right to request access to the data we hold, correct inaccurate profile information, or opt out of non-transactional marketing communications at any time. To unsubscribe from newsletters or delete your account, click the unsubscribe link in any marketing email or contact us at <a href="mailto:care@circleuponline.com" className="text-forest underline font-semibold">care@circleuponline.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
