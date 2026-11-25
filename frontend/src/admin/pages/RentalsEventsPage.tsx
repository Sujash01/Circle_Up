import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Clock,
  MapPin,
  Users,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminCardSkeleton } from '../components/AdminSkeleton';
import { formatPrice, rentalCatalogItemSchema, RENTAL_BOOKING_TRANSITIONS, type AdminRentalBooking, type RentalBookingStatus, type RentalCatalogItem } from '@circleup/shared';
import { useAdminAuth } from '../context/AdminAuthContext';

type RentalItem = RentalCatalogItem & { _id?: string; createdAt?: string; updatedAt?: string };

interface EventItem {
  id?: string;
  _id?: string;
  title: string;
  date: string;
  location: string;
  description: string;
  image?: string;
  type: 'POP_UP' | 'COMMUNITY' | 'OFFLINE_SALE';
  capacity?: number;
  registeredCount: number;
  isRegistrationOpen: boolean;
}

export default function RentalsEventsPage() {
  const { showToast } = useAdminToast();
  const { isOwner } = useAdminAuth();
  const [tab, setTab] = useState<'rentals' | 'bookings' | 'events'>('rentals');
  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<RentalItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [bookings, setBookings] = useState<AdminRentalBooking[]>([]);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPages, setBookingPages] = useState(1);
  const [bookingSaving, setBookingSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const dataRequest = useRef(0);

  // Modal form states
  const [editingRental, setEditingRental] = useState<Partial<RentalItem> | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<EventItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const request = ++dataRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      switch (tab) {
        case 'rentals':
          setRentals((await adminApi.getRentals()) as unknown as RentalItem[]);
          break;
        case 'events':
          setEvents((await adminApi.getEvents()) as unknown as EventItem[]);
          break;
        case 'bookings': {
          const result = await adminApi.getRentalBookings(bookingPage);
          setBookings(result.data);
          setBookingPages(result.meta.totalPages);
          break;
        }
      }
    } catch (err: unknown) {
      if (request === dataRequest.current) setLoadError(err instanceof Error ? err.message : 'Unable to load this section.');
    } finally {
      if (request === dataRequest.current) setLoading(false);
    }
  }, [bookingPage, tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBookingStatus = async (id: string, status: RentalBookingStatus) => {
    setBookingSaving(id);
    try {
      const updated = await adminApi.updateRentalBooking(id, status);
      setBookings((rows) => rows.map((row) => row.id === id ? updated : row));
      showToast('success', 'Booking status updated.');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to update booking.');
    } finally {
      setBookingSaving(null);
    }
  };

  const handleSaveRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRental || !editingRental.name || !editingRental.image) {
      showToast('error', 'Please provide a name and image');
      return;
    }
    setSaving(true);
    try {
      const rentalId = editingRental.id || editingRental._id;
      const slug =
        editingRental.slug ||
        editingRental.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

      const parsed = rentalCatalogItemSchema.safeParse({
        name: editingRental.name,
        slug,
        category: editingRental.category,
        image: editingRental.image,
        rentalPrice3Days: editingRental.rentalPrice3Days,
        rentalPrice7Days: editingRental.rentalPrice7Days,
        rentalPrice14Days: editingRental.rentalPrice14Days,
        securityDeposit: editingRental.securityDeposit,
        condition: editingRental.condition,
        size: editingRental.size,
        isAvailable: editingRental.isAvailable,
        description: editingRental.description,
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        showToast('error', issue ? `${issue.path.join(' ')} — ${issue.message}` : 'Check the rental fields.');
        return;
      }
      const payload = parsed.data;

      if (rentalId && rentalId !== 'new') {
        const updated = (await adminApi.updateRental(rentalId, payload)) as unknown as RentalItem;
        showToast('success', 'Rental item updated');
        setRentals((prev) => prev.map((r) => (r.id === rentalId || r._id === rentalId ? updated : r)));
      } else {
        const created = (await adminApi.createRental(payload)) as unknown as RentalItem;
        showToast('success', 'New rental item added');
        setRentals((prev) => [created, ...prev]);
      }
      setEditingRental(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save rental item';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRental = async (id: string) => {
    if (!confirm('Are you sure you want to remove this rental item?')) return;
    try {
      await adminApi.deleteRental(id);
      showToast('success', 'Rental item deleted');
      setRentals((prev) => prev.filter((r) => r.id !== id && r._id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete rental item';
      showToast('error', msg);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editingEvent.title || !editingEvent.date || !editingEvent.location) {
      showToast('error', 'Please provide title, date, and location');
      return;
    }
    setSaving(true);
    try {
      const eventId = editingEvent.id || editingEvent._id;
      const { title, date, location, description, image, type, capacity, isRegistrationOpen } = editingEvent;
      const payload = { title, date, location, description, image, type, capacity, isRegistrationOpen };
      if (eventId && eventId !== 'new') {
        const updated = (await adminApi.updateEvent(eventId, payload)) as unknown as EventItem;
        showToast('success', 'Event updated');
        setEvents((prev) => prev.map((ev) => (ev.id === eventId || ev._id === eventId ? updated : ev)));
      } else {
        const created = (await adminApi.createEvent(payload)) as unknown as EventItem;
        showToast('success', 'New community event published');
        setEvents((prev) => [created, ...prev]);
      }
      setEditingEvent(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save event';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await adminApi.deleteEvent(id);
      showToast('success', 'Event removed');
      setEvents((prev) => prev.filter((ev) => ev.id !== id && ev._id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete event';
      showToast('error', msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Rentals & Events</h1>
          <p className="text-xs text-cocoa/70">
            Manage the circular rental rail rates and upcoming community pop-ups or swap meets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
          {tab === 'rentals' ? (
            <button
              onClick={() =>
                setEditingRental({
                  id: 'new',
                  name: '',
                  category: 'rentals',
                  image: '/assets/rtw-3.webp',
                  rentalPrice3Days: 100000,
                  rentalPrice7Days: 180000,
                  rentalPrice14Days: 280000,
                  securityDeposit: 250000,
                  condition: 'Mint',
                  size: 'Size M',
                  isAvailable: true,
                  description: '',
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors"
            >
              <Plus className="size-4" />
              Add Rental Piece
            </button>
          ) : tab === 'events' && (
            <button
              onClick={() =>
                setEditingEvent({
                  id: 'new',
                  title: '',
                  date: 'Saturday, 11:00 AM - 6:00 PM',
                  location: 'CircleUp Studio Courtyard, Sector 7, Chandigarh',
                  description: '',
                  type: 'POP_UP',
                  capacity: 80,
                  registeredCount: 0,
                  isRegistrationOpen: true,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors"
            >
              <Plus className="size-4" />
              Add Community Event
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border gap-2">
        <button
          type="button"
          onClick={() => setTab('rentals')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'rentals'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Sparkles className="size-4" />
          Rentals Rail ({rentals.length})
        </button>
        <button type="button" onClick={() => setTab('bookings')}
          className={`border-b-2 px-3 pb-3 text-xs font-bold sm:text-sm ${tab === 'bookings' ? 'border-primary text-primary' : 'border-transparent text-cocoa/60'}`}>
          Rental Bookings
        </button>
        <button
          type="button"
          onClick={() => setTab('events')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'events'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Calendar className="size-4" />
          Community Events ({events.length})
        </button>
      </div>

      {loading ? (
        <AdminCardSkeleton count={3} />
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">{loadError} <button type="button" onClick={fetchData} className="underline">Retry</button></p>
      ) : tab === 'bookings' ? (
        <div className="space-y-3">
          {bookings.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm">No rental bookings found.</p>}
          {bookings.map((booking) => (
            <details key={booking.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                {booking.productName ?? 'Rental booking'} · {booking.customerName} · {booking.status}
              </summary>
              <div className="mt-3 space-y-2">
                <p>{booking.startDate} to {booking.endDate} · {booking.durationDays} days · {booking.size}</p>
                <p>{booking.customerPhone}{booking.customerEmail && ` · ${booking.customerEmail}`}</p>
                <p>Rental fee {formatPrice(booking.rentalFeePaise)} · Deposit {formatPrice(booking.securityDepositPaise)} · Total {formatPrice(booking.totalPaise)}</p>
                <p>Requested {new Date(booking.createdAt).toLocaleString('en-IN')}</p>
                {booking.notes && <p className="whitespace-pre-wrap">{booking.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {RENTAL_BOOKING_TRANSITIONS[booking.status].map((status) => (
                    <button key={status} type="button" disabled={bookingSaving !== null}
                      onClick={() => void handleBookingStatus(booking.id, status)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold">
                      Mark {status.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          ))}
          {bookingPages > 1 && <div className="flex items-center gap-3 text-xs">
            <button type="button" disabled={bookingPage <= 1} onClick={() => setBookingPage(bookingPage - 1)}>Previous</button>
            <span>Page {bookingPage} of {bookingPages}</span>
            <button type="button" disabled={bookingPage >= bookingPages} onClick={() => setBookingPage(bookingPage + 1)}>Next</button>
          </div>}
        </div>
      ) : tab === 'rentals' ? (
        /* Rentals List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rentals.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm">No rental items found.</p>}
          {rentals.map((item) => (
            <div
              key={item.id || item._id}
              className="rounded-xl border border-border bg-card p-4 shadow-xs flex flex-col justify-between space-y-3"
            >
              <div className="space-y-3">
                <div className="flex gap-3">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="size-16 rounded-lg object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-cocoa truncate">{item.name}</p>
                    <p className="text-xs text-terracotta">{item.condition} • {item.size}</p>
                    <span
                      className={`inline-block mt-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${
                        item.isAvailable
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {item.isAvailable ? 'Available to Rent' : 'Reserved / Rented'}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-background p-2.5 text-xs text-cocoa/80 space-y-1">
                  <div className="flex justify-between">
                    <span>3-Day Rent:</span>
                    <span className="font-bold text-terracotta">{formatPrice(item.rentalPrice3Days)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>7-Day Rent:</span>
                    <span className="font-bold text-terracotta">{formatPrice(item.rentalPrice7Days)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>14-Day Rent:</span>
                    <span className="font-bold text-terracotta">{formatPrice(item.rentalPrice14Days)}</span>
                  </div>
                  <div className="flex justify-between text-[0.7rem] text-cocoa/60 pt-1 border-t border-border">
                    <span>Security Deposit:</span>
                    <span>{formatPrice(item.securityDeposit)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  onClick={() => setEditingRental(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-border text-cocoa/70 hover:text-primary transition-colors"
                >
                  <Edit2 className="size-3.5" />
                  Edit
                </button>
                {isOwner && <button
                  onClick={() => handleDeleteRental(item.id || item._id || '')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-border text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Events List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((ev) => (
            <div
              key={ev.id || ev._id}
              className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-cocoa">{ev.title}</h3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-primary uppercase tracking-wider shrink-0">
                    {ev.type}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-cocoa/80">
                  <p className="flex items-center gap-1.5 text-cocoa/70">
                    <Clock className="size-3.5" />
                    {ev.date}
                  </p>
                  <p className="flex items-center gap-1.5 text-cocoa/70">
                    <MapPin className="size-3.5" />
                    {ev.location}
                  </p>
                  <p className="flex items-center gap-1.5 text-cocoa/70">
                    <Users className="size-3.5" />
                    {ev.registeredCount} / {ev.capacity || 'Unlimited'} Thrifters Registered
                  </p>
                </div>

                {ev.description && (
                  <p className="text-xs text-cocoa/70 line-clamp-2">{ev.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border/60">
                <span
                  className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full ${
                    ev.isRegistrationOpen
                      ? 'bg-green-100 text-green-800'
                      : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {ev.isRegistrationOpen ? 'Registration Open' : 'Registration Closed'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingEvent(ev)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-border text-cocoa/70 hover:text-primary transition-colors"
                  >
                    <Edit2 className="size-3.5" />
                    Edit
                  </button>
                  {isOwner && <button
                    onClick={() => handleDeleteEvent(ev.id || ev._id || '')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-border text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Rental Modal */}
      {editingRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveRental}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-bold text-cocoa">
                {editingRental.id === 'new' ? 'New Rental Piece' : 'Edit Rental Piece'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingRental(null)}
                className="text-cocoa/60 hover:text-cocoa font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-cocoa mb-1">Item Title</label>
                <input
                  type="text"
                  required
                  value={editingRental.name || ''}
                  onChange={(e) => setEditingRental({ ...editingRental, name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Condition</label>
                  <input
                    type="text"
                    value={editingRental.condition || 'Mint'}
                    onChange={(e) => setEditingRental({ ...editingRental, condition: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Size</label>
                  <input
                    type="text"
                    value={editingRental.size || 'Size M'}
                    onChange={(e) => setEditingRental({ ...editingRental, size: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Image URL / Path</label>
                <input
                  type="text"
                  required
                  value={editingRental.image || ''}
                  onChange={(e) => setEditingRental({ ...editingRental, image: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-cocoa mb-1">3-Day Rate (Paise)</label>
                  <input
                    type="number"
                    value={editingRental.rentalPrice3Days || 0}
                    onChange={(e) =>
                      setEditingRental({
                        ...editingRental,
                        rentalPrice3Days: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">7-Day Rate (Paise)</label>
                  <input
                    type="number"
                    value={editingRental.rentalPrice7Days || 0}
                    onChange={(e) =>
                      setEditingRental({
                        ...editingRental,
                        rentalPrice7Days: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">14-Day Rate (Paise)</label>
                  <input
                    type="number"
                    value={editingRental.rentalPrice14Days || 0}
                    onChange={(e) =>
                      setEditingRental({
                        ...editingRental,
                        rentalPrice14Days: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Security Deposit (Paise)</label>
                <input
                  type="number"
                  value={editingRental.securityDeposit || 0}
                  onChange={(e) =>
                    setEditingRental({
                      ...editingRental,
                      securityDeposit: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rental-avail"
                  checked={Boolean(editingRental.isAvailable)}
                  onChange={(e) =>
                    setEditingRental({ ...editingRental, isAvailable: e.target.checked })
                  }
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <label htmlFor="rental-avail" className="font-semibold text-cocoa">
                  Available for booking
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingRental(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-cocoa hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-forest-deep disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Rental Piece'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveEvent}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-bold text-cocoa">
                {editingEvent.id === 'new' ? 'New Community Event' : 'Edit Event'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="text-cocoa/60 hover:text-cocoa font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-cocoa mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={editingEvent.title || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Date & Time Range</label>
                <input
                  type="text"
                  required
                  value={editingEvent.date || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                  placeholder="e.g. Saturday, November 28, 2026 · 11:00 AM - 6:00 PM"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Location</label>
                <input
                  type="text"
                  required
                  value={editingEvent.location || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Event Type</label>
                  <select
                    value={editingEvent.type || 'POP_UP'}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        type: e.target.value as 'POP_UP' | 'COMMUNITY' | 'OFFLINE_SALE',
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                  >
                    <option value="POP_UP">Pop-Up Store</option>
                    <option value="COMMUNITY">Community Swap Meet</option>
                    <option value="OFFLINE_SALE">Offline Sale Event</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Max Capacity</label>
                  <input
                    type="number"
                    value={editingEvent.capacity || 100}
                    onChange={(e) =>
                      setEditingEvent({ ...editingEvent, capacity: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingEvent.description || ''}
                  onChange={(e) =>
                    setEditingEvent({ ...editingEvent, description: e.target.value })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="event-reg-open"
                  checked={Boolean(editingEvent.isRegistrationOpen)}
                  onChange={(e) =>
                    setEditingEvent({ ...editingEvent, isRegistrationOpen: e.target.checked })
                  }
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <label htmlFor="event-reg-open" className="font-semibold text-cocoa">
                  Registration open to thrifters
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-cocoa hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-forest-deep disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Community Event'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
