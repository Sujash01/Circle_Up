import { Calendar, Clock, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { eventService } from '@/services/communityServices';

export function EventsPage() {
  const events = eventService.getAllEvents();
  const savedRegistrations = eventService.getRegistrations();

  return (
    <div className="space-y-14">
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-end border-b border-foreground/15 pb-7">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
            The Social Circle
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">
            Community Events &amp; Swaps
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          Upcoming sample gatherings, wardrobe swaps, and visible-mending workshops. All listings
          and registrations here are simulated frontend previews, not confirmed real-world events.
        </p>
      </header>

      <div className="space-y-14">
        {events.map((evt, idx) => (
          <article
            key={evt.id}
            className="grid gap-8 lg:grid-cols-[1fr_1.05fr] items-center pb-12 border-b border-foreground/15 last:border-b-0"
          >
            <Link
              to={`/events/${evt.id}`}
              className={idx % 2 === 1 ? 'lg:order-2 block overflow-hidden bg-[#ece6d2]' : 'block overflow-hidden bg-[#ece6d2]'}
            >
              <img
                src={evt.image}
                alt={evt.title}
                className="aspect-[16/11] w-full object-cover hover:scale-[1.02] transition-transform duration-700"
              />
            </Link>

            <div className={idx % 2 === 1 ? 'lg:order-1 space-y-4 lg:pr-6' : 'space-y-4 lg:pl-6'}>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-terracotta">
                {evt.spotsLabel}
              </p>
              <h2 className="font-display text-3xl text-cocoa leading-tight">
                <Link to={`/events/${evt.id}`} className="hover:text-primary transition-colors">
                  {evt.title}
                </Link>
              </h2>
              <p className="text-sm leading-relaxed text-foreground/85">{evt.description}</p>

              <div className="pt-1 space-y-1.5 text-xs text-cocoa">
                <p className="flex items-center gap-2">
                  <Calendar className="size-3.5 text-primary" />
                  <span>{evt.date}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="size-3.5 text-primary" />
                  <span>{evt.time}</span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-primary" />
                  <span>{evt.location}</span>
                </p>
              </div>

              <div className="pt-3">
                <Link
                  to={`/events/${evt.id}`}
                  className="inline-block bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
                >
                  View Details &amp; Register
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {savedRegistrations.length > 0 && (
        <section className="border-t border-foreground/15 pt-8 space-y-4">
          <h2 className="font-display text-2xl text-cocoa">
            Your Locally Saved Simulated Event Registrations
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedRegistrations.map((reg) => (
              <div key={reg.id} className="border border-foreground/15 bg-card/80 p-4 text-xs space-y-1">
                <p className="font-bold text-cocoa">{reg.eventTitle}</p>
                <p className="text-terracotta">
                  Ref: {reg.id} · {reg.name}
                </p>
                <p className="text-foreground/75">{reg.email} (Saved locally only)</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

