import { Calendar, Clock, MapPin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { eventService } from '@/services/communityServices';
import type { EventRegistration } from '@/types/storefront';

export function EventDetailPage() {
  const { id = '' } = useParams();
  const event = eventService.getEventById(id);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState<EventRegistration | null>(null);

  if (!event) {
    return (
      <EmptyState
        title="Sample event not found"
        description="Return to The Social Circle to view all upcoming sample community gatherings."
        actionLabel="Back to Events"
        actionTo="/events"
      />
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setRegistration(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!/^[+\d\s-]{8,15}$/.test(phone.trim())) {
      setError('Please enter a valid phone number.');
      return;
    }

    const res = eventService.registerForEvent({ event, name, email, phone, notes });
    if (res.error || !res.registration) {
      setError(res.error ?? 'Could not save simulated registration.');
      return;
    }

    setRegistration(res.registration);
    setName('');
    setEmail('');
    setPhone('');
    setNotes('');
  };

  return (
    <div className="space-y-12">
      <nav aria-label="Breadcrumb" className="text-xs text-terracotta flex items-center gap-2">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <Link to="/events" className="hover:text-primary">
          The Social Circle
        </Link>
        <span>/</span>
        <span className="text-cocoa font-medium">{event.title}</span>
      </nav>

      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-start">
        <div className="space-y-6">
          <div className="overflow-hidden bg-[#ece6d2]">
            <img
              src={event.image}
              alt={event.title}
              className="aspect-[16/10] w-full object-cover"
            />
          </div>

          <div className="space-y-4">
            <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">
              {event.spotsLabel}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl text-cocoa">{event.title}</h1>

            <div className="space-y-2 text-xs text-cocoa border-y border-foreground/15 py-4">
              <p className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <span>{event.date}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <span>{event.time}</span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <span>{event.location}</span>
              </p>
            </div>

            <p className="text-sm leading-relaxed text-foreground/85">{event.fullDetails}</p>

            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-terracotta">
                What to Expect
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-cocoa">
                {event.highlights.map((hl) => (
                  <li key={hl}>{hl}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-card/85 border border-foreground/15 p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="font-display text-2xl text-cocoa">Simulated Event RSVP</h2>
            <p className="mt-1 text-xs text-terracotta">
              Saves a simulated registration locally in your browser. This is a sample mock event,
              not a confirmed real-world booking.
            </p>
          </div>

          <div>
            <label htmlFor="evt-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Full Name
            </label>
            <input
              id="evt-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Your name"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="evt-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Email
            </label>
            <input
              id="evt-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="evt-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Phone
            </label>
            <input
              id="evt-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+91 98XXXXXXXX"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="evt-notes" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Swap / Workshop Notes (Optional)
            </label>
            <input
              id="evt-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Items you plan to bring or size preferences"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-primary py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            Save Simulated Registration
          </button>

          {registration && (
            <div className="border border-primary/40 bg-accent/60 p-4 text-xs text-cocoa space-y-1">
              <p className="font-bold text-primary">
                Simulated RSVP Saved ({registration.id})
              </p>
              <p>
                Saved locally for {registration.name} ({registration.email}). Note: This is a mock
                event preview and has not been sent to an external server.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

