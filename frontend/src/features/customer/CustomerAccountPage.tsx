import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  User,
  ShoppingBag,
  Heart,
  MapPin,
  Leaf,
  Sparkles,
  LogOut,
  Package,
  Calendar,
  Clock,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { RootState } from '@/app/store';
import { authService } from '@/services/authService';
import { useStore } from '@/context/StoreContext';
import { formatPrice } from '@circleup/shared';

export function CustomerAccountPage() {
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { wishlistIds } = useStore();
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'sustainability'>('orders');

  const handleSignOut = () => {
    authService.signOut();
    navigate('/');
  };

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-12 text-center space-y-4 p-8 rounded-3xl border border-foreground/15 bg-card/90 shadow-sm">
        <User className="size-12 text-cocoa/40 mx-auto" />
        <h1 className="font-serif text-2xl font-bold text-cocoa">Sign In Required</h1>
        <p className="text-xs text-foreground/70">
          Please sign in to view your circular wardrobe, order tracking, and account perks.
        </p>
        <Link
          to="/signin?redirect=/account"
          className="inline-flex min-h-[44px] items-center justify-center w-full px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs uppercase tracking-wider hover:bg-forest-deep transition-colors"
        >
          Sign In to Your Account
        </Link>
      </div>
    );
  }

  // Sample customer orders for authentic display
  const demoOrders = [
    {
      id: 'CU-88421',
      date: 'November 12, 2026',
      status: 'CONFIRMED',
      totalAmount: 255000,
      items: [
        { name: 'Vintage Wool Houndstooth Blazer', size: 'Size M', price: 255000 },
      ],
    },
    {
      id: 'CU-87910',
      date: 'October 28, 2026',
      status: 'DELIVERED',
      totalAmount: 490000,
      items: [
        { name: 'Embroidered Kashmiri Waistcoat', size: 'Size S', price: 295000 },
        { name: 'Structured Leather Saddle Bag', size: 'One Size', price: 195000 },
      ],
    },
  ];

  const initials = currentUser.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4 sm:py-8">
      {/* Account Profile Banner */}
      <div className="rounded-3xl border border-foreground/15 bg-card/95 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-primary/10 border-2 border-primary/30 text-primary font-serif text-2xl font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-cocoa tracking-tight">
                  {currentUser.fullName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-[0.65rem] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="size-3" />
                  Circle Insider
                </span>
              </div>
              <p className="text-xs text-foreground/70 mt-1">
                {currentUser.email} • Member of The Social Circle
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-[40px] items-center gap-1.5 px-4 py-2 rounded-full border border-foreground/20 hover:border-destructive hover:text-destructive bg-card/60 text-xs font-semibold text-cocoa transition-colors"
            >
              <LogOut className="size-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Circular Fashion Impact Ticker */}
        <div className="mt-6 grid grid-cols-3 gap-3 pt-6 border-t border-foreground/10 text-center">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-terracotta">
              <Leaf className="size-3 text-primary" />
              <span>Garments Rehomed</span>
            </div>
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">3 pieces</p>
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-terracotta">
              <Sparkles className="size-3 text-amber-700" />
              <span>CO2 Avoided</span>
            </div>
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">10.2 kg</p>
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-terracotta">
              <ShieldCheck className="size-3 text-primary" />
              <span>Water Conserved</span>
            </div>
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">5,400 L</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-foreground/15 pb-2 text-xs font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`pb-2 px-3 border-b-2 transition-colors ${
            activeTab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          My Orders ({demoOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`pb-2 px-3 border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          Delivery & Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sustainability')}
          className={`pb-2 px-3 border-b-2 transition-colors ${
            activeTab === 'sustainability'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          Circular Wardrobe
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-cocoa">Recent Purchases</h2>
            <Link
              to="/new-arrivals"
              className="text-xs font-semibold text-primary hover:underline underline-offset-4"
            >
              Discover more vintage finds →
            </Link>
          </div>

          <div className="space-y-3">
            {demoOrders.map((ord) => (
              <div
                key={ord.id}
                className="rounded-2xl border border-foreground/15 bg-card/80 p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-foreground/10 pb-3 text-xs">
                  <div>
                    <span className="font-bold text-cocoa text-sm">{ord.id}</span>
                    <span className="text-foreground/60 ml-2">{ord.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                        ord.status === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {ord.status}
                    </span>
                    <span className="font-bold text-crimson text-sm">{formatPrice(ord.totalAmount)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {ord.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs text-cocoa">
                      <div className="flex items-center gap-2">
                        <Package className="size-3.5 text-primary" />
                        <span>{item.name}</span>
                        <span className="text-foreground/50">({item.size})</span>
                      </div>
                      <span className="font-medium text-crimson">{formatPrice(item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-foreground/15 bg-card/90 p-5 space-y-3">
            <h3 className="font-serif text-sm font-bold text-cocoa">Account Details</h3>
            <div className="space-y-2 text-xs text-foreground/80">
              <div>
                <span className="text-[0.68rem] uppercase font-bold text-terracotta block">Full Name</span>
                <span className="font-semibold text-cocoa">{currentUser.fullName}</span>
              </div>
              <div>
                <span className="text-[0.68rem] uppercase font-bold text-terracotta block">Email Address</span>
                <span className="font-semibold text-cocoa">{currentUser.email}</span>
              </div>
              <div>
                <span className="text-[0.68rem] uppercase font-bold text-terracotta block">Account Role</span>
                <span className="font-semibold text-cocoa">{currentUser.role}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-foreground/15 bg-card/90 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-bold text-cocoa">Saved Delivery Address</h3>
              <MapPin className="size-4 text-terracotta" />
            </div>
            <div className="text-xs text-foreground/80 space-y-1">
              <p className="font-semibold text-cocoa">{currentUser.fullName}</p>
              <p>Hill Road, Bandra West</p>
              <p>Mumbai, Maharashtra 400050</p>
              <p>India</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sustainability' && (
        <div className="rounded-2xl border border-foreground/15 bg-card/90 p-6 space-y-4">
          <h3 className="font-serif text-base font-bold text-cocoa">Your Circular Wardrobe Impact</h3>
          <p className="text-xs text-foreground/80 leading-relaxed max-w-xl">
            By choosing curated vintage and circular fashion through CircleUp, you prevent high-emission manufacturing and keep garments circulating in their next beautiful chapter.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-foreground/15 bg-background space-y-2">
              <div className="flex items-center gap-2">
                <Heart className="size-4 text-steel" />
                <h4 className="font-bold text-xs text-cocoa">Saved Wishlist</h4>
              </div>
              <p className="text-xs text-foreground/70">
                You have {wishlistIds.length} one-of-a-kind vintage pieces saved in your collection.
              </p>
              <Link
                to="/wishlist"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>View Wishlist</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="p-4 rounded-xl border border-foreground/15 bg-background space-y-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                <h4 className="font-bold text-xs text-cocoa">Rentals & Occasions</h4>
              </div>
              <p className="text-xs text-foreground/70">
                Explore luxury statement pieces available for 3, 7, or 14-day zero-waste rentals.
              </p>
              <Link
                to="/rentals"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>Browse Rentals</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerAccountPage;

