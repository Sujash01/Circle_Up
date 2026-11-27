import { useState, type FormEvent } from 'react';
import { apiClient } from '@/services/apiClient';
import { buildBusinessWhatsappUrl } from '@/services/cartService';
import { useStorefrontSettings } from '@/services/storefrontSettingsService';
import type { ContactSubmission } from '@/types/storefront';

export function ContactPage() {
  const { whatsappNumber } = useStorefrontSettings();
  const whatsappUrl = buildBusinessWhatsappUrl(whatsappNumber);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedEntry, setSavedEntry] = useState<ContactSubmission | null>(null);
  const [history, setHistory] = useState<ContactSubmission[]>([]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setSavedEntry(null);

    if (name.trim().length < 2) {
      setError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (subject.trim().length < 3) {
      setError('Please enter a brief subject.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Message must be at least 10 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post<{ data: ContactSubmission }>('/contact', {
        name,
        email,
        subject,
        message,
      });
      const submittedEntry = response.data.data;
      setSavedEntry(submittedEntry);
      setHistory((current) => [submittedEntry, ...current]);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'We could not send your message. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-12">
      <header className="border-b border-foreground/15 pb-6 max-w-2xl">
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Contact CircleUp</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          Questions about measurements, rentals, or upcoming swap events? Send an enquiry below or
          reach out via WhatsApp.
        </p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] items-start">
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-display text-xl text-cocoa">Store Details</h2>
            <p className="mt-2 text-foreground/80 leading-relaxed">
              CircleUp Curated Pre-Loved &amp; Thrift Storefront
            </p>

            <div className="mt-4 space-y-3">
              {/* Phone */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-primary" aria-hidden>📞</span>
                <a href="tel:+916280746336" className="underline hover:text-primary transition-colors">
                  +91 62807 46336
                </a>
              </div>

              {/* WhatsApp */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5" aria-hidden>💬</span>
                {whatsappUrl ? (
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">
                    WhatsApp enquiry line
                  </a>
                ) : (
                  <span className="text-foreground/60">WhatsApp enquiries are currently unavailable.</span>
                )}
              </div>

              {/* Instagram */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5" aria-hidden>📸</span>
                <a
                  href="https://www.instagram.com/circleup.23/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary transition-colors"
                >
                  @circleup.23
                </a>
              </div>
            </div>
          </div>

          {history.length > 0 && (
            <div className="border-t border-foreground/15 pt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
                Recent Enquiries ({history.length})
              </p>
              <ul className="space-y-2 text-xs">
                {history.slice(0, 3).map((item) => (
                  <li key={item.id} className="border-l-2 border-primary/50 pl-3">
                    <p className="font-medium text-cocoa">{item.subject}</p>
                    <p className="text-terracotta">
                      {item.id} · {item.email}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card/80 border border-foreground/15 p-6 sm:p-8">
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="contact-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contact-subject" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Subject
            </label>
            <input
              id="contact-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="Sizing enquiry, rental question, event info..."
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="contact-message" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Message
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              placeholder="Write your message here..."
              className="w-full border border-foreground/25 bg-transparent p-3 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>

          {savedEntry && (
            <div className="border border-primary/40 bg-accent/60 p-4 text-xs text-cocoa space-y-1">
              <p className="font-bold text-primary">
                Message Sent ({savedEntry.id})
              </p>
              <p>
                Thank you! Your message &ldquo;{savedEntry.subject}&rdquo; has been received. Our team will get back to you shortly.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

