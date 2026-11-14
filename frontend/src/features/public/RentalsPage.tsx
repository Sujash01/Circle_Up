import { useMemo, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/services/cartService';
import { rentalService } from '@/services/rentalService';
import type { RentalProduct, SimulatedRentalRequest } from '@/types/storefront';

function addDaysIso(startIso: string, deltaDays: number): string {
  const [y, m, d] = startIso.split('-').map(Number);
  if (!y || !m || !d) return startIso;
  const date = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return date.toISOString().slice(0, 10);
}

export function RentalsPage() {
  const rentals = rentalService.getAllRentalProducts();
  const [selectedId, setSelectedId] = useState<string>(rentals[0]?.id ?? '');
  const selectedProduct: RentalProduct =
    rentals.find((r) => r.id === selectedId) ?? rentals[0]!;

  const todayIso = new Date().toISOString().slice(0, 10);
  const [size, setSize] = useState<string>(selectedProduct.sizes[0] ?? 'One Size');
  const [startDate, setStartDate] = useState<string>(addDaysIso(todayIso, 2));
  const [endDate, setEndDate] = useState<string>(addDaysIso(todayIso, 4));
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [savedRequests, setSavedRequests] = useState<SimulatedRentalRequest[]>(() =>
    rentalService.loadSubmittedRequests(),
  );
  const [latestRequest, setLatestRequest] = useState<SimulatedRentalRequest | null>(null);

  const blockedSet = useMemo(
    () => rentalService.getBlockedDatesForProduct(selectedProduct, savedRequests),
    [selectedProduct, savedRequests],
  );

  const quote = useMemo(
    () => rentalService.evaluateQuote(selectedProduct, startDate, endDate, blockedSet),
    [selectedProduct, startDate, endDate, blockedSet],
  );

  const handleSelectProduct = (product: RentalProduct) => {
    setSelectedId(product.id);
    setSize(product.sizes[0] ?? 'One Size');
    setFormError('');
    setLatestRequest(null);
  };

  const applyDurationPreset = (days: number) => {
    const base = startDate >= todayIso ? startDate : addDaysIso(todayIso, 1);
    setStartDate(base);
    setEndDate(addDaysIso(base, Math.max(0, days - 1)));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setLatestRequest(null);

    if (!customerName.trim() || customerName.trim().length < 2) {
      setFormError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[+\d\s-]{8,15}$/.test(customerPhone.trim())) {
      setFormError('Please enter a valid contact phone number.');
      return;
    }

    const res = rentalService.submitSimulatedRequest({
      product: selectedProduct,
      size,
      startDate,
      endDate,
      customerName,
      customerPhone,
      notes,
    });

    if (res.error || !res.request) {
      setFormError(res.error ?? 'Could not evaluate rental dates.');
      return;
    }

    setSavedRequests(rentalService.loadSubmittedRequests());
    setLatestRequest(res.request);
    setNotes('');
  };

  return (
    <div className="space-y-14">
      {/* Header */}
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-end border-b border-foreground/15 pb-7">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
            Borrow Instead of Buying Once
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">
            CircleUp Rental Rail
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          Reserve statement outerwear, tailored sets, and collector bags for shoots or events.
          Submissions here are saved locally as simulated requests and are not confirmed bookings.
        </p>
      </header>

      {/* Main split: Catalog selection + Interactive Date & Cost Estimator */}
      <section className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-start">
        {/* Rentable pieces */}
        <div className="space-y-6">
          <h2 className="font-display text-2xl text-cocoa">Select a Rentable Piece</h2>

          <div className="grid sm:grid-cols-2 gap-6">
            {rentals.map((item) => {
              const active = item.id === selectedProduct.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectProduct(item)}
                  className={cn(
                    'text-left group transition-all border-b-2 pb-4',
                    active ? 'border-primary' : 'border-transparent hover:border-foreground/30',
                  )}
                >
                  <div className="overflow-hidden bg-[#ece6d2]">
                    <img
                      src={item.images[0]}
                      alt={item.name}
                      className="aspect-[4/4.5] w-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                    />
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-cocoa group-hover:text-primary">
                        {item.name}
                      </span>
                      <span className="text-xs font-bold text-primary shrink-0 tabular-nums">
                        {formatPrice(item.dailyRate)} / day
                      </span>
                    </div>
                    <p className="text-xs text-terracotta">
                      Deposit: {formatPrice(item.securityDeposit)} · {item.availabilityLabel}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected piece details, availability & simulator */}
        <div className="border-t-2 lg:border-t-0 lg:border-l border-foreground/15 pt-8 lg:pt-0 lg:pl-10 space-y-6">
          <div className="space-y-2">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-terracotta">
              {selectedProduct.categoryLabel} · {selectedProduct.condition}
            </p>
            <h2 className="font-display text-3xl text-cocoa">{selectedProduct.name}</h2>
            <p className="text-sm leading-relaxed text-foreground/85">
              {selectedProduct.description}
            </p>
          </div>

          {/* Mock availability block */}
          <div className="bg-secondary/70 p-4 space-y-2 text-xs">
            <p className="font-semibold uppercase tracking-wider text-cocoa">
              Mock Unavailable Dates (Cannot be selected)
            </p>
            <p className="text-terracotta leading-relaxed">
              {Array.from(blockedSet).sort().join(', ') || 'No blocked dates'}
            </p>
            <p className="text-foreground/75">
              Allowed duration: {selectedProduct.minDays} to {selectedProduct.maxDays} days.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Size & quick duration */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rental-size" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1.5">
                  Size
                </label>
                <select
                  id="rental-size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
                >
                  {selectedProduct.sizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1.5">
                  Quick Duration
                </span>
                <div className="flex gap-2">
                  {[3, 5, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      disabled={days < selectedProduct.minDays || days > selectedProduct.maxDays}
                      onClick={() => applyDurationPreset(days)}
                      className="border border-foreground/30 px-3 py-1.5 text-xs font-medium text-cocoa hover:border-primary disabled:opacity-35"
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date pickers */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rental-start" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1.5">
                  Start Date
                </label>
                <input
                  id="rental-start"
                  type="date"
                  min={todayIso}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rental-end" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1.5">
                  Return Date
                </label>
                <input
                  id="rental-end"
                  type="date"
                  min={startDate || todayIso}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Live estimate breakdown */}
            <div className="border-y border-foreground/15 py-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-terracotta">
                  Rental Fee ({quote.durationDays} day{quote.durationDays === 1 ? '' : 's'} ×{' '}
                  {formatPrice(selectedProduct.dailyRate)})
                </span>
                <span className="font-medium tabular-nums">
                  {formatPrice(quote.estimatedRentalFee)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-terracotta">Refundable Security Deposit</span>
                <span className="font-medium tabular-nums">
                  {formatPrice(quote.securityDeposit)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-foreground/10 font-bold text-cocoa">
                <span>Estimated Initial Payable</span>
                <span className="text-primary tabular-nums">{formatPrice(quote.estimatedTotal)}</span>
              </div>

              {!quote.valid && quote.error && (
                <p className="text-xs font-medium text-destructive pt-1">{quote.error}</p>
              )}
            </div>

            {/* Customer contact fields for simulated submission */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rental-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                  Your Name
                </label>
                <input
                  id="rental-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rental-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                  Phone / WhatsApp
                </label>
                <input
                  id="rental-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  required
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rental-notes" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Event / Fitting Notes (Optional)
              </label>
              <input
                id="rental-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any fit or pickup timing notes"
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              />
            </div>

            {/* Rental terms */}
            <div className="text-xs text-foreground/80 space-y-1">
              <p className="font-semibold uppercase tracking-wider text-terracotta">
                Rental Terms &amp; Care
              </p>
              <ul className="list-disc pl-4 space-y-1">
                {selectedProduct.terms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>

            {formError && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={!quote.valid}
              className="w-full bg-primary py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-45"
            >
              Submit Simulated Rental Request
            </button>

            <p className="text-[0.72rem] text-terracotta">
              Notice: This saves a simulated rental request in your browser&apos;s LocalStorage only.
              It is not a confirmed booking and has not been transmitted to a server.
            </p>
          </form>

          {latestRequest && (
            <div className="border border-primary/40 bg-accent/60 p-4 text-xs space-y-1">
              <p className="font-bold text-primary">
                Simulated Request Saved Locally ({latestRequest.id})
              </p>
              <p className="text-cocoa">
                {latestRequest.rentalProductName} ({latestRequest.size}) · {latestRequest.startDate}{' '}
                to {latestRequest.endDate} ({latestRequest.durationDays} days)
              </p>
              <p className="text-terracotta">
                Estimated total: {formatPrice(latestRequest.estimatedTotal)} (incl. deposit). This is
                a frontend simulation, not a confirmed reservation.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Locally saved simulated rental requests */}
      {savedRequests.length > 0 && (
        <section className="pt-8 border-t border-foreground/15 space-y-4">
          <h2 className="font-display text-2xl text-cocoa">
            Your Locally Saved Simulated Rental Requests
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedRequests.map((req) => (
              <div key={req.id} className="border border-foreground/15 bg-card/70 p-4 text-xs space-y-1">
                <p className="font-bold text-cocoa">{req.rentalProductName}</p>
                <p className="text-terracotta">
                  Ref: {req.id} · Size {req.size}
                </p>
                <p className="text-cocoa">
                  {req.startDate} → {req.endDate} ({req.durationDays} days)
                </p>
                <p className="font-semibold text-primary tabular-nums">
                  Est. {formatPrice(req.estimatedTotal)} (Simulated — not confirmed)
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

