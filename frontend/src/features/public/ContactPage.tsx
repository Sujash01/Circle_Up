import { useState, type FormEvent } from 'react';
import { apiClient } from '@/services/apiClient';
import { WHATSAPP_BUSINESS_NUMBER } from '@/services/cartService';
import { contactService } from '@/services/communityServices';
import type { ContactSubmission } from '@/types/storefront';

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savedEntry, setSavedEntry] = useState<ContactSubmission | null>(null);
  const [history, setHistory] = useState<ContactSubmission[]>(() =>
    contactService.getSubmissions(),
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
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

    const result = contactService.saveSubmission({ name, email, subject, message });
    setSavedEntry(result.submission);
    setHistory(contactService.getSubmissions());
    void apiClient.post('/contact', { name, email, subject, message }).catch(() => {});
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="space-y-12">
      <header className="border-b border-foreground/15 pb-6 max-w-2xl">
        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">Get in Touch</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Contact CircleUp</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          Questions about measurements, rentals, or upcoming swap events? Send a simulated local
          enquiry below or reach out via our WhatsApp placeholder.
        </p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] items-start">
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-display text-xl text-cocoa">Store Details</h2>
            <p className="mt-2 text-foreground/80 leading-relaxed">
              CircleUp Curated Vintage &amp; Thrift Storefront
              <br />
              Instagram: @CircleUp
              <br />
              WhatsApp Checkout Line: +{WHATSAPP_BUSINESS_NUMBER} (configurable placeholder)
            </p>
          </div>

          <div className="border-t border-foreground/15 pt-5 text-xs leading-relaxed text-terracotta space-y-2">
            <p className="font-semibold uppercase tracking-wider text-cocoa">
              Frontend Simulation Notice
            </p>
            <p>
              This phase runs entirely in your browser without a backend server or CRM. Form
              submissions are stored in LocalStorage for local preview only and are not emailed or
              delivered to a server.
            </p>
          </div>

          {history.length > 0 && (
            <div className="border-t border-foreground/15 pt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
                Locally Saved Enquiries ({history.length})
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
            className="bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            Save Simulated Message
          </button>

          {savedEntry && (
            <div className="border border-primary/40 bg-accent/60 p-4 text-xs text-cocoa space-y-1">
              <p className="font-bold text-primary">
                Saved Locally ({savedEntry.id})
              </p>
              <p>
                Your message &ldquo;{savedEntry.subject}&rdquo; was saved in this browser&apos;s
                LocalStorage (simulated frontend submission — not sent to a server or CRM).
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

