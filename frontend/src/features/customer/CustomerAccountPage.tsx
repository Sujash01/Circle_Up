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
  CreditCard,
  Plus,
  Trash2,
  Check,
  Truck,
  ExternalLink,
  Download,
  RotateCcw,
  Tag,
  AlertCircle,
  FileText,
  Phone,
  Mail,
  Edit2,
  CheckCircle2,
} from 'lucide-react';
import type { RootState } from '@/app/store';
import { authService } from '@/services/authService';
import { useStore } from '@/context/StoreContext';
import { formatPrice } from '@circleup/shared';

// Safe product imagery imports adhering to AGENTS.md (zero model photos)
import rtw1 from '@/assets/rtw-1.jpg';
import rtw2 from '@/assets/rtw-2.jpg';
import rtw3 from '@/assets/rtw-3.jpg';
import bag1 from '@/assets/bag-1.jpg';
import bag2 from '@/assets/bag-2.jpg';
import winter1 from '@/assets/winter-1.jpg';

interface SavedAddress {
  id: string;
  name: string;
  phone: string;
  street: string;
  locality: string;
  city: string;
  state: string;
  pin: string;
  type: 'Home' | 'Work' | 'Studio';
  isDefault: boolean;
}

interface SavedUPI {
  id: string;
  upiId: string;
  appName: string;
  isDefault: boolean;
}

interface SavedCard {
  id: string;
  last4: string;
  brand: 'Visa' | 'Mastercard' | 'RuPay';
  bankName: string;
  holderName: string;
  expiry: string;
  isDefault: boolean;
}

export function CustomerAccountPage() {
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { wishlistIds } = useStore();

  const [activeTab, setActiveTab] = useState<'orders' | 'purchases' | 'addresses' | 'payments' | 'sustainability'>('orders');
  const [orderFilter, setOrderFilter] = useState<'all' | 'in_transit' | 'delivered'>('all');
  const [selectedOrderTracking, setSelectedOrderTracking] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<string | null>(null);
  const [reCircleSuccess, setReCircleSuccess] = useState<string | null>(null);

  // Addresses State
  const [addresses, setAddresses] = useState<SavedAddress[]>([
    {
      id: 'addr-1',
      name: currentUser?.fullName || 'Aanya Sharma',
      phone: currentUser?.phone || '+91 98201 44520',
      street: 'Flat 402, Sea Green Apartments, Hill Road',
      locality: 'Near St. Peter Church, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pin: '400050',
      type: 'Home',
      isDefault: true,
    },
    {
      id: 'addr-2',
      name: currentUser?.fullName || 'Aanya Sharma',
      phone: currentUser?.phone || '+91 98201 44520',
      street: 'Studio 12, Indiranagar 100ft Road',
      locality: 'Opposite Metro Pillar 84',
      city: 'Bengaluru',
      state: 'Karnataka',
      pin: '560038',
      type: 'Studio',
      isDefault: false,
    },
  ]);

  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({
    name: currentUser?.fullName || '',
    phone: '',
    street: '',
    locality: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    pin: '',
    type: 'Home' as 'Home' | 'Work' | 'Studio',
    isDefault: false,
  });

  // Payment Methods State
  const [savedUpis, setSavedUpis] = useState<SavedUPI[]>([
    { id: 'upi-1', upiId: 'aanya.sharma@okhdfcbank', appName: 'Google Pay', isDefault: true },
    { id: 'upi-2', upiId: '9820144520@paytm', appName: 'Paytm UPI', isDefault: false },
  ]);

  const [savedCards, setSavedCards] = useState<SavedCard[]>([
    {
      id: 'card-1',
      last4: '4242',
      brand: 'Visa',
      bankName: 'HDFC Bank Regalia',
      holderName: currentUser?.fullName || 'AANYA SHARMA',
      expiry: '08/29',
      isDefault: true,
    },
    {
      id: 'card-2',
      last4: '8812',
      brand: 'Mastercard',
      bankName: 'ICICI Bank Coral',
      holderName: currentUser?.fullName || 'AANYA SHARMA',
      expiry: '11/28',
      isDefault: false,
    },
  ]);

  const [showAddUpi, setShowAddUpi] = useState(false);
  const [newUpiId, setNewUpiId] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCard, setNewCard] = useState({
    holderName: '',
    number: '',
    expiry: '',
    bankName: '',
    brand: 'Visa' as 'Visa' | 'Mastercard' | 'RuPay',
  });

  const [codEnabled, setCodEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSignOut = () => {
    authService.signOut();
    navigate('/');
  };

  const handleDemoSignIn = async () => {
    await authService.signInWithGoogle({
      fullName: 'Aanya Sharma',
      email: 'aanya.sharma@example.com',
    });
  };

  // Orders data with rich timestamps and paise currency amounts
  const demoOrders = [
    {
      id: 'CU-88421',
      date: 'November 12, 2026',
      estimatedDelivery: 'November 16, 2026',
      courier: 'Bluedart Express',
      trackingNumber: 'BD-774921049',
      status: 'IN_TRANSIT',
      step: 3, // 1: Placed, 2: Packed, 3: Dispatched, 4: Delivered
      shippingAddress: 'Flat 402, Sea Green Apartments, Hill Road, Bandra West, Mumbai 400050',
      totalAmount: 255000,
      items: [
        {
          name: 'Vintage Wool Houndstooth Blazer',
          size: 'Size M',
          color: 'Earthy Charcoal / Cream',
          image: rtw1,
          price: 255000,
          qty: 1,
        },
      ],
    },
    {
      id: 'CU-87910',
      date: 'October 28, 2026',
      estimatedDelivery: 'November 02, 2026',
      courier: 'Delhivery Surface',
      trackingNumber: 'DL-908123712',
      status: 'DELIVERED',
      step: 4,
      shippingAddress: 'Flat 402, Sea Green Apartments, Hill Road, Bandra West, Mumbai 400050',
      totalAmount: 490000,
      items: [
        {
          name: 'Embroidered Kashmiri Velvet Waistcoat',
          size: 'Size S',
          color: 'Deep Forest Moss',
          image: rtw2,
          price: 295000,
          qty: 1,
        },
        {
          name: 'Structured Leather Saddle Bag',
          size: 'One Size',
          color: 'Warm Cocoa Tan',
          image: bag1,
          price: 195000,
          qty: 1,
        },
      ],
    },
    {
      id: 'CU-86542',
      date: 'September 19, 2026',
      estimatedDelivery: 'September 24, 2026',
      courier: 'India Post Speed Post',
      trackingNumber: 'EM-449102847IN',
      status: 'DELIVERED',
      step: 4,
      shippingAddress: 'Studio 12, Indiranagar 100ft Road, Bengaluru 560038',
      totalAmount: 320000,
      items: [
        {
          name: 'Chunky Hand-Knit Wool Cardigan',
          size: 'Size Free / Relaxed',
          color: 'Oatmeal Tweed',
          image: winter1,
          price: 320000,
          qty: 1,
        },
      ],
    },
  ];

  // Purchases & Wardrobe catalog
  const ownedPurchases = [
    {
      id: 'pur-1',
      title: 'Vintage Wool Houndstooth Blazer',
      category: 'Jackets & Blazers',
      condition: 'Pristine Archival (Grade A+)',
      acquiredDate: 'November 12, 2026',
      orderId: 'CU-88421',
      price: 255000,
      image: rtw1,
      tag: '1990s Italian Tailoring',
      co2Saved: '3.8 kg',
    },
    {
      id: 'pur-2',
      title: 'Embroidered Kashmiri Velvet Waistcoat',
      category: 'Ethnic & Heirloom',
      condition: 'Restored Heritage Silk',
      acquiredDate: 'October 28, 2026',
      orderId: 'CU-87910',
      price: 295000,
      image: rtw2,
      tag: 'Circa 1984 Artisan Piece',
      co2Saved: '4.2 kg',
    },
    {
      id: 'pur-3',
      title: 'Structured Leather Saddle Bag',
      category: 'Handcrafted Accessories',
      condition: 'Naturally Patinated Leather',
      acquiredDate: 'October 28, 2026',
      orderId: 'CU-87910',
      price: 195000,
      image: bag1,
      tag: 'Full Grain Hand-Stitched',
      co2Saved: '2.2 kg',
    },
    {
      id: 'pur-4',
      title: 'Chunky Hand-Knit Wool Cardigan',
      category: 'Winterwear & Knitwear',
      condition: 'Pure Himalayan Wool',
      acquiredDate: 'September 19, 2026',
      orderId: 'CU-86542',
      price: 320000,
      image: winter1,
      tag: 'Zero-Waste Wool Revival',
      co2Saved: '5.1 kg',
    },
  ];

  // Active & Past Rentals
  const rentalItems = [
    {
      id: 'rent-1',
      title: 'Handcrafted Indigo Kantha Duster Jacket',
      rentalPeriod: 'Nov 14 – Nov 21, 2026 (7 Days)',
      returnDueDate: 'November 21, 2026',
      depositStatus: 'Refundable Security Held',
      rentalFee: 145000,
      image: rtw3,
      status: 'Active — Return in 6 Days',
      isDueSoon: false,
    },
    {
      id: 'rent-2',
      title: 'Artisan Brass Inlay Structured Minaudière',
      rentalPeriod: 'Oct 10 – Oct 14, 2026 (4 Days)',
      returnDueDate: 'October 14, 2026',
      depositStatus: 'Security Deposit Refunded (₹3,000)',
      rentalFee: 95000,
      image: bag2,
      status: 'Returned & Inspected',
      isDueSoon: false,
    },
  ];

  const filteredOrders = demoOrders.filter((ord) => {
    if (orderFilter === 'in_transit') return ord.status === 'IN_TRANSIT' || ord.status === 'CONFIRMED';
    if (orderFilter === 'delivered') return ord.status === 'DELIVERED';
    return true;
  });

  // Not signed in preview gate
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto my-12 sm:my-16 px-4">
        <div className="text-center space-y-6 p-8 sm:p-10 rounded-3xl border-2 border-foreground/15 bg-card/95 shadow-md">
          <div className="size-16 rounded-full bg-primary/10 border-2 border-primary/25 text-primary flex items-center justify-center mx-auto">
            <User className="size-8" />
          </div>

          <div className="space-y-2">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] font-bold text-terracotta">
              Member Portal
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-cocoa">
              Sign In to Access Your Wardrobe
            </h1>
            <p className="text-xs text-foreground/75 max-w-sm mx-auto leading-relaxed">
              Track orders, manage delivery addresses, saved payment methods, and your circular wardrobe archive.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Link
              to="/signin?redirect=/account"
              className="inline-flex min-h-[44px] items-center justify-center w-full px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs uppercase tracking-wider hover:bg-forest-deep transition-all shadow-xs"
            >
              Sign In to Your Account
            </Link>

            <Link
              to="/signup?redirect=/account"
              className="inline-flex min-h-[44px] items-center justify-center w-full px-6 py-2.5 rounded-full border-2 border-primary/40 bg-card hover:bg-primary/5 text-primary font-semibold text-xs uppercase tracking-wider transition-all"
            >
              Create New Account
            </Link>

            <div className="pt-4 border-t border-foreground/15">
              <p className="text-[0.68rem] uppercase tracking-wider text-muted-foreground mb-2">
                Instant Verification Mode
              </p>
              <button
                type="button"
                onClick={handleDemoSignIn}
                className="w-full py-2.5 px-4 rounded-full border border-terracotta/40 bg-terracotta/5 hover:bg-terracotta/10 text-xs font-bold text-terracotta transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="size-3.5" />
                <span>Explore Demo Collector Profile (Aanya Sharma)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const initials = currentUser.fullName
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CU';

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddr.name || !newAddr.phone || !newAddr.street || !newAddr.pin) {
      showNotification('Please fill in all mandatory address fields.');
      return;
    }
    const created: SavedAddress = {
      id: `addr-${Date.now().toString(36)}`,
      name: newAddr.name,
      phone: newAddr.phone,
      street: newAddr.street,
      locality: newAddr.locality,
      city: newAddr.city,
      state: newAddr.state,
      pin: newAddr.pin,
      type: newAddr.type,
      isDefault: newAddr.isDefault || addresses.length === 0,
    };
    if (created.isDefault) {
      setAddresses(addresses.map((a) => ({ ...a, isDefault: false })).concat(created));
    } else {
      setAddresses([...addresses, created]);
    }
    setShowAddAddress(false);
    setNewAddr({
      name: currentUser.fullName,
      phone: '',
      street: '',
      locality: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      pin: '',
      type: 'Home',
      isDefault: false,
    });
    showNotification('New delivery address successfully saved.');
  };

  const handleSetDefaultAddress = (id: string) => {
    setAddresses(addresses.map((a) => ({ ...a, isDefault: a.id === id })));
    showNotification('Default delivery address updated.');
  };

  const handleDeleteAddress = (id: string) => {
    if (addresses.length <= 1) {
      showNotification('At least one address must be saved in your profile.');
      return;
    }
    setAddresses(addresses.filter((a) => a.id !== id));
    showNotification('Address removed.');
  };

  const handleAddUpi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpiId.trim() || !newUpiId.includes('@')) {
      showNotification('Please enter a valid UPI ID (e.g. name@okhdfcbank).');
      return;
    }
    const created: SavedUPI = {
      id: `upi-${Date.now().toString(36)}`,
      upiId: newUpiId.trim().toLowerCase(),
      appName: 'Custom UPI App',
      isDefault: savedUpis.length === 0,
    };
    setSavedUpis([...savedUpis, created]);
    setNewUpiId('');
    setShowAddUpi(false);
    showNotification('UPI ID linked and verified.');
  };

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = newCard.number.replace(/\s/g, '');
    if (cleanNum.length < 12 || !newCard.holderName.trim()) {
      showNotification('Please enter a valid cardholder name and number.');
      return;
    }
    const created: SavedCard = {
      id: `card-${Date.now().toString(36)}`,
      last4: cleanNum.slice(-4),
      brand: newCard.brand,
      bankName: newCard.bankName || 'Verified Bank',
      holderName: newCard.holderName.toUpperCase(),
      expiry: newCard.expiry || '12/28',
      isDefault: savedCards.length === 0,
    };
    setSavedCards([...savedCards, created]);
    setNewCard({ holderName: '', number: '', expiry: '', bankName: '', brand: 'Visa' });
    setShowAddCard(false);
    showNotification('Payment card securely tokenized per RBI guidelines.');
  };

  const handleReCircleGarment = (title: string) => {
    setReCircleSuccess(title);
    setTimeout(() => setReCircleSuccess(null), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 py-4 sm:py-8 px-3 sm:px-4">
      {/* Toast notification banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-forest-deep px-5 py-3 text-xs font-semibold text-white shadow-xl border border-white/20 animate-fadeIn"
        >
          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Account Profile Banner */}
      <div className="rounded-3xl border border-foreground/15 bg-card/95 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="size-16 sm:size-18 rounded-full bg-primary/10 border-2 border-primary/30 text-primary font-serif text-2xl font-bold flex items-center justify-center shrink-0 shadow-xs">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-cocoa tracking-tight">
                  {currentUser.fullName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-[0.65rem] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="size-3" />
                  Circle Insider
                </span>
                {currentUser.authProvider && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/80 text-[0.62rem] font-semibold text-cocoa/80 border border-foreground/10">
                    via {currentUser.authProvider === 'google' ? 'Google' : currentUser.authProvider === 'phone' ? 'Phone OTP' : 'Email'}
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/70 mt-1 flex flex-wrap items-center gap-2">
                <span>{currentUser.email}</span>
                {currentUser.phone && (
                  <>
                    <span>•</span>
                    <span>{currentUser.phone}</span>
                  </>
                )}
                <span>•</span>
                <span className="text-terracotta font-medium">Founding Collector</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            {currentUser.actorType === 'ADMIN' && (
              <Link
                to="/admin"
                className="inline-flex min-h-[38px] items-center gap-1.5 px-4 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-colors"
              >
                <span>Admin Dashboard</span>
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-[38px] items-center gap-1.5 px-4 py-1.5 rounded-full border border-foreground/20 hover:border-destructive hover:text-destructive bg-card/60 text-xs font-semibold text-cocoa transition-colors"
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
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">4 pieces</p>
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-terracotta">
              <Sparkles className="size-3 text-amber-700" />
              <span>CO₂ Avoided</span>
            </div>
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">15.3 kg</p>
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-terracotta">
              <ShieldCheck className="size-3 text-primary" />
              <span>Water Conserved</span>
            </div>
            <p className="font-serif text-xl sm:text-2xl font-bold text-cocoa">7,800 L</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Clean, responsive pill buttons */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-foreground/15 text-xs font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`pb-2.5 px-4 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'orders'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Package className="size-3.5" />
          <span>Orders ({demoOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('purchases')}
          className={`pb-2.5 px-4 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'purchases'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <ShoppingBag className="size-3.5" />
          <span>Purchases & Wardrobe ({ownedPurchases.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('addresses')}
          className={`pb-2.5 px-4 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'addresses'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <MapPin className="size-3.5" />
          <span>Address Details ({addresses.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`pb-2.5 px-4 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'payments'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <CreditCard className="size-3.5" />
          <span>Payment Methods</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sustainability')}
          className={`pb-2.5 px-4 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'sustainability'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Leaf className="size-3.5" />
          <span>Circular Impact</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ORDERS & TRACKING                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-bold text-cocoa">Your Order History</h2>
              <p className="text-xs text-foreground/70">
                Track live consignments, view packaging timeline, and access official tax invoices.
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-full border border-foreground/10 text-xs">
              <button
                type="button"
                onClick={() => setOrderFilter('all')}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  orderFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-cocoa/70 hover:text-cocoa'
                }`}
              >
                All ({demoOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('in_transit')}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  orderFilter === 'in_transit'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-cocoa/70 hover:text-cocoa'
                }`}
              >
                Active (1)
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('delivered')}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  orderFilter === 'delivered'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-cocoa/70 hover:text-cocoa'
                }`}
              >
                Delivered (2)
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredOrders.map((ord) => (
              <div
                key={ord.id}
                className="rounded-3xl border border-foreground/15 bg-card/90 p-5 sm:p-6 shadow-xs space-y-5"
              >
                {/* Order Top Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-foreground/10 pb-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-cocoa text-base">{ord.id}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                          ord.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {ord.status === 'IN_TRANSIT' ? 'In Transit / On the Way' : ord.status}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/60">
                      Ordered on {ord.date} • Delivered via {ord.courier}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-[0.68rem] uppercase font-bold tracking-wider text-terracotta">
                      Total Paid
                    </p>
                    <p className="font-bold text-crimson text-lg tabular-nums">
                      {formatPrice(ord.totalAmount)}
                    </p>
                  </div>
                </div>

                {/* Progress Stepper */}
                <div className="bg-background/80 rounded-2xl p-4 border border-foreground/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cocoa flex items-center gap-1.5">
                      <Truck className="size-4 text-primary" />
                      <span>Delivery Status: {ord.status === 'DELIVERED' ? 'Delivered safely' : `Expected by ${ord.estimatedDelivery}`}</span>
                    </span>
                    <span className="text-muted-foreground text-[0.7rem] font-mono">
                      AWB: {ord.trackingNumber}
                    </span>
                  </div>

                  {/* 4-step progress line */}
                  <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                    {[
                      { label: 'Confirmed', step: 1 },
                      { label: 'Packaging', step: 2 },
                      { label: 'Dispatched', step: 3 },
                      { label: 'Delivered', step: 4 },
                    ].map((s) => {
                      const isComplete = ord.step >= s.step;
                      const isCurrent = ord.step === s.step;
                      return (
                        <div key={s.label} className="space-y-1.5">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              isComplete
                                ? 'bg-primary'
                                : 'bg-foreground/10'
                            }`}
                          />
                          <p
                            className={`text-[0.68rem] font-bold uppercase tracking-wider ${
                              isCurrent
                                ? 'text-primary'
                                : isComplete
                                  ? 'text-cocoa'
                                  : 'text-foreground/40'
                            }`}
                          >
                            {s.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Items in this order */}
                <div className="space-y-3 divide-y divide-foreground/10">
                  {ord.items.map((item) => (
                    <div key={item.name} className="pt-3 first:pt-0 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="size-14 sm:size-16 rounded-xl object-cover shrink-0 border border-foreground/10 shadow-xs"
                        />
                        <div className="min-w-0">
                          <p className="font-serif font-bold text-sm text-cocoa truncate">{item.name}</p>
                          <p className="text-xs text-foreground/60 mt-0.5">
                            {item.size} • {item.color} • Qty {item.qty}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-terracotta mt-1">
                            <ShieldCheck className="size-3" />
                            <span>100% Curated Circular Vintage</span>
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold text-crimson text-sm tabular-nums">
                          {formatPrice(item.price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer order actions */}
                <div className="pt-3 border-t border-foreground/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <p className="text-muted-foreground text-[0.72rem] truncate max-w-sm">
                    Shipping to: {ord.shippingAddress}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInvoiceModal(ord.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-foreground/20 hover:border-primary text-cocoa hover:text-primary transition-colors text-xs font-semibold"
                    >
                      <Download className="size-3" />
                      <span>Invoice</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderTracking(selectedOrderTracking === ord.id ? null : ord.id);
                      }}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-xs font-bold"
                    >
                      <Truck className="size-3" />
                      <span>{selectedOrderTracking === ord.id ? 'Hide Tracking' : 'Live Tracking'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Tracking Details Accordion */}
                {selectedOrderTracking === ord.id && (
                  <div className="rounded-2xl bg-secondary/40 border border-foreground/15 p-4 space-y-3 text-xs animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-foreground/10 pb-2">
                      <span className="font-bold text-cocoa">Courier Partner: {ord.courier}</span>
                      <span className="font-mono text-primary font-bold">Waybill: {ord.trackingNumber}</span>
                    </div>
                    <div className="space-y-2 text-foreground/80">
                      <div className="flex items-start gap-2">
                        <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-cocoa">Dispatched from Bandra Sorting Hub</p>
                          <p className="text-[0.68rem] text-muted-foreground">Nov 13, 2026 • 09:45 AM — Package in transit with Bluedart courier</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="size-2 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-cocoa">Quality Inspected & Sealed in Crumbled Paper Wrapping</p>
                          <p className="text-[0.68rem] text-muted-foreground">Nov 12, 2026 • 04:30 PM — CircleUp Archival Care Center</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="size-2 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-cocoa">Order Placed & Payment Confirmed</p>
                          <p className="text-[0.68rem] text-muted-foreground">Nov 12, 2026 • 02:15 PM — Electronic Transfer</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PURCHASES & CIRCULAR WARDROBE                                      */}
      {/* ========================================================================= */}
      {activeTab === 'purchases' && (
        <div className="space-y-8">
          {/* Re-Circle Notification Toast */}
          {reCircleSuccess && (
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  Re-Circle request initiated for <strong>{reCircleSuccess}</strong>! A consignment prepaid shipping label will arrive in your email shortly.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReCircleSuccess(null)}
                className="text-primary hover:underline font-bold text-[0.68rem]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Section 1: Owned Garments */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-lg font-bold text-cocoa">Your Circular Wardrobe Archive</h2>
                <p className="text-xs text-foreground/70">
                  Every curated piece you own, its provenance tag, and the circular credit you can claim whenever you wish to re-home it.
                </p>
              </div>

              <Link
                to="/new-arrivals"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 self-start sm:self-center"
              >
                <span>Discover new drops</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {ownedPurchases.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl border border-foreground/15 bg-card/90 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all"
                >
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden aspect-4/3 border border-foreground/10 bg-secondary/30">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                      />
                      <span className="absolute top-2.5 left-2.5 bg-card/90 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider text-primary border border-primary/20">
                        {item.tag}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-serif text-base font-bold text-cocoa leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.category} • Acquired {item.acquiredDate}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-foreground/10">
                      <div>
                        <span className="text-[0.68rem] uppercase font-bold text-terracotta block">
                          Condition
                        </span>
                        <span className="font-medium text-cocoa text-[0.78rem]">{item.condition}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[0.68rem] uppercase font-bold text-terracotta block">
                          Purchase Value
                        </span>
                        <span className="font-bold text-crimson tabular-nums text-sm">
                          {formatPrice(item.price)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-foreground/10 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[0.68rem] text-primary font-bold">
                      <Leaf className="size-3" />
                      <span>{item.co2Saved} CO₂ Saved</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleReCircleGarment(item.title)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-terracotta/40 bg-terracotta/5 hover:bg-terracotta text-terracotta hover:text-white text-xs font-bold transition-all shadow-xs"
                    >
                      <RotateCcw className="size-3" />
                      <span>Re-Circle Garment</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Active & Upcoming Rentals */}
          <div className="space-y-4 pt-4 border-t border-foreground/15">
            <div>
              <h2 className="font-serif text-lg font-bold text-cocoa">Active & Past Rentals</h2>
              <p className="text-xs text-foreground/70">
                Temporary zero-waste wardrobe statements for weddings, events, and shoots.
              </p>
            </div>

            <div className="space-y-3">
              {rentalItems.map((rent) => (
                <div
                  key={rent.id}
                  className="rounded-2xl border border-foreground/15 bg-card/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={rent.image}
                      alt={rent.title}
                      className="size-16 sm:size-18 rounded-xl object-cover shrink-0 border border-foreground/10"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif font-bold text-sm text-cocoa truncate">{rent.title}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[0.62rem] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 shrink-0">
                          {rent.status}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/70 mt-0.5">
                        Rental Period: {rent.rentalPeriod}
                      </p>
                      <p className="text-[0.72rem] text-terracotta font-semibold mt-0.5">
                        {rent.depositStatus}
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <span className="font-bold text-crimson text-sm tabular-nums">
                      {formatPrice(rent.rentalFee)}
                    </span>
                    <Link
                      to="/rentals"
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>Extend or Return</span>
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ADDRESS DETAILS                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'addresses' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-bold text-cocoa">Saved Delivery Addresses</h2>
              <p className="text-xs text-foreground/70">
                Manage where your circular packages and curated vintage parcels are dispatched.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddAddress(!showAddAddress)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-forest-deep transition-all shadow-xs self-start sm:self-center"
            >
              <Plus className="size-3.5" />
              <span>{showAddAddress ? 'Cancel' : 'Add New Address'}</span>
            </button>
          </div>

          {/* Add Address Form Modal / Inline Box */}
          {showAddAddress && (
            <form
              onSubmit={handleAddAddress}
              className="rounded-3xl border-2 border-primary/30 bg-card p-6 shadow-md space-y-4 animate-fadeIn"
            >
              <h3 className="font-serif text-base font-bold text-cocoa">Add Delivery Address</h3>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Recipient Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddr.name}
                    onChange={(e) => setNewAddr({ ...newAddr, name: e.target.value })}
                    placeholder="Aanya Sharma"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Mobile Phone Number <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={newAddr.phone}
                    onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                    placeholder="+91 98201 44520"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Flat / House / Apartment / Street Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddr.street}
                    onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })}
                    placeholder="Flat 402, Sea Green Apartments, Hill Road"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Locality / Landmark
                  </label>
                  <input
                    type="text"
                    value={newAddr.locality}
                    onChange={(e) => setNewAddr({ ...newAddr, locality: e.target.value })}
                    placeholder="Near St. Peter Church"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Postal PIN Code <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={newAddr.pin}
                    onChange={(e) => setNewAddr({ ...newAddr, pin: e.target.value })}
                    placeholder="400050"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    City <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddr.city}
                    onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                    placeholder="Mumbai"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    State <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddr.state}
                    onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                    placeholder="Maharashtra"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-cocoa uppercase tracking-wider text-[0.68rem] block">
                    Address Type
                  </label>
                  <div className="flex gap-2">
                    {(['Home', 'Work', 'Studio'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewAddr({ ...newAddr, type: t })}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                          newAddr.type === t
                            ? 'bg-primary text-white border-primary'
                            : 'border-foreground/20 text-cocoa hover:bg-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    id="isDefaultAddr"
                    type="checkbox"
                    checked={newAddr.isDefault}
                    onChange={(e) => setNewAddr({ ...newAddr, isDefault: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  <label htmlFor="isDefaultAddr" className="text-xs text-cocoa select-none cursor-pointer">
                    Set as default delivery address
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-foreground/15">
                <button
                  type="button"
                  onClick={() => setShowAddAddress(false)}
                  className="px-4 py-2 rounded-full border border-foreground/25 text-xs font-semibold text-cocoa hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-forest-deep shadow-xs"
                >
                  Save Address
                </button>
              </div>
            </form>
          )}

          {/* Saved Address Cards Grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`rounded-3xl border p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                  addr.isDefault
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-foreground/15 bg-card/90'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider bg-card border border-foreground/15 text-cocoa">
                      <MapPin className="size-3 text-terracotta" />
                      <span>{addr.type}</span>
                    </span>

                    {addr.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-full">
                        <Check className="size-3" />
                        Default Address
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-foreground/80 space-y-1">
                    <p className="font-bold text-cocoa text-sm">{addr.name}</p>
                    <p className="font-medium text-cocoa/90">{addr.phone}</p>
                    <p className="pt-1">{addr.street}</p>
                    {addr.locality && <p>{addr.locality}</p>}
                    <p>
                      {addr.city}, {addr.state} — <span className="font-mono font-bold">{addr.pin}</span>
                    </p>
                    <p className="text-muted-foreground text-[0.7rem]">India</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-foreground/10 flex items-center justify-between text-xs">
                  {!addr.isDefault ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultAddress(addr.id)}
                      className="text-primary hover:underline font-bold text-xs"
                    >
                      Make Default
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-[0.7rem]">Dispatched by default</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="p-1.5 rounded-full text-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Delete address"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PAYMENT METHODS                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-bold text-cocoa">Payment Methods</h2>
              <p className="text-xs text-foreground/70">
                Seamless and tokenized checkouts compliant with Reserve Bank of India (RBI) tokenization guidelines.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddUpi(!showAddUpi)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all shadow-xs"
              >
                <Plus className="size-3" />
                <span>Add UPI ID</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddCard(!showAddCard)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-white text-xs font-bold hover:bg-forest-deep transition-all shadow-xs"
              >
                <Plus className="size-3" />
                <span>Add Card</span>
              </button>
            </div>
          </div>

          {/* Add UPI Form */}
          {showAddUpi && (
            <form
              onSubmit={handleAddUpi}
              className="rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-md space-y-3 animate-fadeIn max-w-lg"
            >
              <h3 className="font-serif text-sm font-bold text-cocoa">Link New UPI ID</h3>
              <p className="text-xs text-foreground/70">
                Enter your Virtual Payment Address (e.g. yourname@okhdfcbank or phone@paytm).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newUpiId}
                  onChange={(e) => setNewUpiId(e.target.value)}
                  placeholder="yourname@okhdfcbank"
                  className="flex-1 px-3 py-2 border border-foreground/25 bg-transparent rounded-lg text-xs font-mono focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-forest-deep"
                >
                  Verify & Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUpi(false)}
                  className="px-3 py-2 rounded-lg border border-foreground/25 text-xs text-cocoa"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Add Card Form */}
          {showAddCard && (
            <form
              onSubmit={handleAddCard}
              className="rounded-3xl border-2 border-primary/30 bg-card p-6 shadow-md space-y-4 animate-fadeIn max-w-lg"
            >
              <h3 className="font-serif text-base font-bold text-cocoa">Add Tokenized Card</h3>
              <p className="text-xs text-foreground/70">
                Card details are tokenized securely under RBI COFT framework. Zero CVV stored.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[0.68rem] uppercase font-bold text-terracotta mb-1">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newCard.holderName}
                    onChange={(e) => setNewCard({ ...newCard, holderName: e.target.value })}
                    placeholder="AANYA SHARMA"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg focus:border-primary uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[0.68rem] uppercase font-bold text-terracotta mb-1">
                    Card Number (16 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={newCard.number}
                    onChange={(e) => setNewCard({ ...newCard, number: e.target.value })}
                    placeholder="4242 •••• •••• 4242"
                    className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg font-mono focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.68rem] uppercase font-bold text-terracotta mb-1">
                      Expiry (MM/YY)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={newCard.expiry}
                      onChange={(e) => setNewCard({ ...newCard, expiry: e.target.value })}
                      placeholder="08/29"
                      className="w-full px-3 py-2 border border-foreground/25 bg-transparent rounded-lg font-mono focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.68rem] uppercase font-bold text-terracotta mb-1">
                      Card Network
                    </label>
                    <select
                      value={newCard.brand}
                      onChange={(e) => setNewCard({ ...newCard, brand: e.target.value as any })}
                      className="w-full px-3 py-2 border border-foreground/25 bg-card rounded-lg focus:border-primary text-xs"
                    >
                      <option value="Visa">Visa</option>
                      <option value="Mastercard">Mastercard</option>
                      <option value="RuPay">RuPay</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-foreground/15">
                <button
                  type="button"
                  onClick={() => setShowAddCard(false)}
                  className="px-4 py-2 rounded-full border border-foreground/25 text-xs text-cocoa"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-forest-deep shadow-xs"
                >
                  Save & Tokenize
                </button>
              </div>
            </form>
          )}

          {/* Saved UPI List */}
          <div className="rounded-3xl border border-foreground/15 bg-card/90 p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-base font-bold text-cocoa flex items-center gap-2">
              <Sparkles className="size-4 text-terracotta" />
              <span>Saved UPI IDs</span>
            </h3>

            <div className="space-y-3">
              {savedUpis.map((upi) => (
                <div
                  key={upi.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-foreground/10 bg-background/70 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      UPI
                    </div>
                    <div>
                      <p className="font-mono font-bold text-cocoa text-sm">{upi.upiId}</p>
                      <p className="text-muted-foreground text-[0.68rem]">
                        {upi.appName} • Verified Instant Checkout
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {upi.isDefault ? (
                      <span className="text-[0.65rem] font-bold text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-full">
                        Primary UPI
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSavedUpis(savedUpis.map((u) => ({ ...u, isDefault: u.id === upi.id })));
                          showNotification('Primary UPI updated.');
                        }}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        Make Primary
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Tokenized Cards */}
          <div className="rounded-3xl border border-foreground/15 bg-card/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-bold text-cocoa flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <span>Saved Credit & Debit Cards (RBI Tokenized)</span>
              </h3>
              <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                <ShieldCheck className="size-3" />
                RBI SafeToken
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {savedCards.map((card) => (
                <div
                  key={card.id}
                  className={`rounded-2xl border p-4 sm:p-5 space-y-3 bg-gradient-to-br from-card to-secondary/30 ${
                    card.isDefault ? 'border-primary/40 shadow-xs' : 'border-foreground/15'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cocoa">{card.bankName}</span>
                    <span className="text-xs font-serif font-bold text-terracotta uppercase">{card.brand}</span>
                  </div>

                  <p className="font-mono text-base tracking-[0.25em] font-bold text-cocoa pt-2">
                    •••• •••• •••• {card.last4}
                  </p>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-foreground/10 text-muted-foreground">
                    <div>
                      <span className="text-[0.62rem] uppercase font-bold block">Cardholder</span>
                      <span className="font-semibold text-cocoa text-[0.72rem]">{card.holderName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[0.62rem] uppercase font-bold block">Expires</span>
                      <span className="font-mono font-semibold text-cocoa text-[0.72rem]">{card.expiry}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cash on Delivery & Trust Assurance */}
          <div className="rounded-3xl border border-foreground/15 bg-card/90 p-5 sm:p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-serif text-sm font-bold text-cocoa">Pay on Delivery (COD)</h4>
                <p className="text-xs text-foreground/70">
                  Allow cash/UPI on delivery for eligible domestic PIN codes.
                </p>
              </div>
              <input
                type="checkbox"
                checked={codEnabled}
                onChange={(e) => {
                  setCodEnabled(e.target.checked);
                  showNotification(e.target.checked ? 'Pay on delivery enabled' : 'Pay on delivery disabled');
                }}
                className="size-5 accent-primary cursor-pointer"
              />
            </div>
          </div>

          {/* Security Guarantee Banner */}
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/50 border border-foreground/10 text-xs text-foreground/75 leading-relaxed">
            <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
            <p>
              <strong>Security Guarantee:</strong> CircleUp uses 256-bit bank-grade encryption. Sensitive payment card credentials are tokenized directly with banking networks pursuant to RBI Master Directions. No sensitive card numbers or CVVs are stored on our servers.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: CIRCULAR SUSTAINABILITY IMPACT                                     */}
      {/* ========================================================================= */}
      {activeTab === 'sustainability' && (
        <div className="rounded-3xl border border-foreground/15 bg-card/95 p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <span className="text-[0.68rem] uppercase font-bold tracking-[0.2em] text-terracotta">
              Your Environmental Legacy
            </span>
            <h2 className="font-display text-2xl font-bold text-cocoa mt-1">
              The Impact of Your Circular Fashion Choices
            </h2>
            <p className="text-xs text-foreground/75 mt-2 max-w-2xl leading-relaxed">
              Every garment circulated through CircleUp preserves natural water reservoirs, avoids industrial synthetic dye runoff, and offsets fresh textile manufacturing emissions.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
              <Leaf className="size-6 text-primary" />
              <h3 className="font-serif text-xl font-bold text-cocoa">15.3 kg CO₂</h3>
              <p className="text-xs text-foreground/70">
                Emissions prevented by keeping 4 vintage garments out of landfills.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
              <Sparkles className="size-6 text-amber-700" />
              <h3 className="font-serif text-xl font-bold text-cocoa">7,800 Litres</h3>
              <p className="text-xs text-foreground/70">
                Freshwater saved equivalent to 98 full laundry cycles.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
              <RotateCcw className="size-6 text-terracotta" />
              <h3 className="font-serif text-xl font-bold text-cocoa">100% Circular</h3>
              <p className="text-xs text-foreground/70">
                All pieces are eligible for CircleUp Re-Circle consignment.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-foreground/10 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-cocoa">Ready to pass on a piece you've cherished?</p>
              <p className="text-xs text-muted-foreground">Receive up to 70% instant consignment credit on CircleUp drops.</p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className="px-5 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-forest-deep transition-all shadow-xs"
            >
              Browse Your Wardrobe to Re-Circle
            </button>
          </div>
        </div>
      )}

      {/* Invoice Modal Simulation */}
      {showInvoiceModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#14281a]/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowInvoiceModal(null)}
        >
          <div
            className="bg-card border-2 border-foreground/20 p-6 sm:p-8 max-w-md w-full space-y-5 rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-foreground/15 pb-3">
              <div>
                <p className="text-[0.68rem] uppercase font-bold tracking-wider text-terracotta">Official Invoice</p>
                <h3 className="font-serif text-xl font-bold text-cocoa">Invoice #{showInvoiceModal}</h3>
              </div>
              <FileText className="size-6 text-primary" />
            </div>

            <div className="text-xs text-foreground/80 space-y-2 leading-relaxed">
              <p><strong>Customer:</strong> {currentUser.fullName}</p>
              <p><strong>GSTIN:</strong> 27AABCC8812M1Z0 (CircleUp Circular Commerce LLP)</p>
              <p><strong>Status:</strong> Paid in Full via Electronic Payment</p>
              <p className="text-muted-foreground text-[0.7rem]">A digital PDF copy has been prepared with full itemized breakdown.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-foreground/15">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(null)}
                className="px-4 py-2 rounded-full border border-foreground/25 text-xs text-cocoa hover:bg-secondary"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  showNotification(`Tax invoice for ${showInvoiceModal} downloaded.`);
                  setShowInvoiceModal(null);
                }}
                className="px-5 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-forest-deep flex items-center gap-1.5 shadow-xs"
              >
                <Download className="size-3.5" />
                <span>Download Tax PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerAccountPage;
