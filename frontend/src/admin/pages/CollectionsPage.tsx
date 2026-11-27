import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Sparkles, Image as ImageIcon, Save, Check, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminCardSkeleton } from '../components/AdminSkeleton';
import type { Product } from '@circleup/shared';
import { formatPrice } from '@circleup/shared';

interface CategoryTile {
  to: string;
  title: string;
  note: string;
  img: string;
  alt: string;
}

const DEFAULT_TILES: CategoryTile[] = [
  {
    to: '/rentals',
    title: 'Rentals',
    note: 'Wear for an occasion, then return it',
    img: '/assets/rtw-3.webp',
    alt: 'Blazer with skirt co-ord set',
  },
  {
    to: '/thrifted-treasure',
    title: 'Thrifted Treasure',
    note: 'One-of-one archive finds',
    img: '/assets/hero-detail-1.webp',
    alt: 'Top and skirt co-ord set on a mannequin',
  },
  {
    to: '/accessories',
    title: 'Accessories',
    note: 'Bags, scarves and small things',
    img: '/assets/bag-3.webp',
    alt: 'Structured handheld bag',
  },
  {
    to: '/events',
    title: 'Social Circle',
    note: 'Store sales and community days',
    img: '/assets/world-social-circle.webp',
    alt: 'Warm lights and leafy branches decorate the CircleUp shop',
  },
];

export default function CollectionsPage() {
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [savingTiles, setSavingTiles] = useState(false);
  const [tiles, setTiles] = useState<CategoryTile[]>(DEFAULT_TILES);
  const [products, setProducts] = useState<Product[]>([]);
  const [chestPicks, setChestPicks] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'tiles' | 'chest' | 'rails'>('tiles');

  const fetchSettingsOnly = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await adminApi.getSettings();
      if (settings?.categoryTiles && settings.categoryTiles.length === 4) {
        setTiles(settings.categoryTiles as CategoryTile[]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load collections data';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchProductsForCollections = useCallback(async () => {
    try {
      const prodsRes = await adminApi.getProducts({ limit: 100 });
      const allProds = prodsRes.data || [];
      setProducts(allProds);
      setChestPicks(allProds.filter((p) => p.chestPick));
      setProductsLoaded(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load products for collections';
      showToast('error', msg);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchSettingsOnly();
  }, [fetchSettingsOnly]);

  useEffect(() => {
    if ((activeTab === 'chest' || activeTab === 'rails') && !productsLoaded) {
      void fetchProductsForCollections();
    }
  }, [activeTab, productsLoaded, fetchProductsForCollections]);

  const handleTileChange = (index: number, field: keyof CategoryTile, val: string) => {
    setTiles((prev) => {
      const updated = [...prev];
      const cur = updated[index] || DEFAULT_TILES[index] || { to: '/', title: '', note: '', img: '', alt: '' };
      updated[index] = { ...cur, [field]: val };
      return updated;
    });
  };

  const handleSaveTiles = async () => {
    setSavingTiles(true);
    try {
      await adminApi.updateSettings({ categoryTiles: tiles });
      showToast('success', 'Homepage tiles updated successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save tiles';
      showToast('error', msg);
    } finally {
      setSavingTiles(false);
    }
  };

  const toggleChestPick = async (prod: Product) => {
    const nextStatus = !prod.chestPick;
    if (nextStatus && chestPicks.length >= 6) {
      showToast('error', 'Maximum 6 chest picks allowed for the 3D Hero. Please unpick one first.');
      return;
    }
    // optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === prod.id ? { ...p, chestPick: nextStatus } : p)),
    );
    setChestPicks((prev) =>
      nextStatus ? [...prev, { ...prod, chestPick: true }] : prev.filter((p) => p.id !== prod.id),
    );

    try {
      await adminApi.updateProduct(prod.id || prod.serialNumber, { chestPick: nextStatus });
      showToast(
        'success',
        nextStatus
          ? `Added "${prod.name}" to 3D Chest Picks`
          : `Removed "${prod.name}" from Chest Picks`,
      );
    } catch (err: unknown) {
      // rollback
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, chestPick: !nextStatus } : p)),
      );
      setChestPicks((prev) =>
        !nextStatus ? [...prev, { ...prod, chestPick: true }] : prev.filter((p) => p.id !== prod.id),
      );
      const msg = err instanceof Error ? err.message : 'Failed to update chest pick';
      showToast('error', msg);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-cocoa">Collections & Tiles</h1>
        <AdminCardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Categories & Collections</h1>
          <p className="text-xs text-cocoa/70">
            Curate the 4 homepage world tiles, 3D chest treasure picks, and collection rails.
          </p>
        </div>
        <button
          onClick={() => {
            void fetchSettingsOnly();
            if (activeTab !== 'tiles' || productsLoaded) {
              void fetchProductsForCollections();
            }
          }}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('tiles')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'tiles'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Layers className="size-4" />
          4 Homepage Tiles
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chest')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'chest'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <Sparkles className="size-4" />
          Chest Picks ({chestPicks.length}/6)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rails')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'rails'
              ? 'border-primary text-primary'
              : 'border-transparent text-cocoa/60 hover:text-cocoa'
          }`}
        >
          <ImageIcon className="size-4" />
          Collection Rails
        </button>
      </div>

      {/* Tab 1: 4 Homepage Tiles */}
      {activeTab === 'tiles' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-cocoa/70">
              These 4 editorial tiles define the entry points on the homepage grid.
            </p>
            <button
              onClick={handleSaveTiles}
              disabled={savingTiles}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors disabled:opacity-50"
            >
              <Save className="size-4" />
              {savingTiles ? 'Saving...' : 'Save All Tiles'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {tiles.map((tile, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-terracotta">
                    Tile #{idx + 1}
                  </span>
                  <span className="text-[0.7rem] text-cocoa/60 font-mono">{tile.to}</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">Title</label>
                    <input
                      type="text"
                      value={tile.title}
                      onChange={(e) => handleTileChange(idx, 'title', e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-cocoa focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">
                      Editorial Note
                    </label>
                    <input
                      type="text"
                      value={tile.note}
                      onChange={(e) => handleTileChange(idx, 'note', e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-cocoa focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">
                      Target Link Route
                    </label>
                    <input
                      type="text"
                      value={tile.to}
                      onChange={(e) => handleTileChange(idx, 'to', e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-cocoa focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">
                      Image Path or URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tile.img}
                        onChange={(e) => handleTileChange(idx, 'img', e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-cocoa focus:border-primary focus:outline-none"
                      />
                      {tile.img && (
                        <img
                          src={tile.img}
                          alt={tile.alt || tile.title}
                          className="size-9 rounded-md object-cover border border-border"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">
                      Accessibility Alt Text
                    </label>
                    <input
                      type="text"
                      value={tile.alt}
                      onChange={(e) => handleTileChange(idx, 'alt', e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-cocoa focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Chest Picks */}
      {activeTab === 'chest' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-cocoa">Curate 3D Treasure Chest Picks</h2>
              <p className="text-xs text-cocoa/70">
                Choose 4 to 6 standout curated items to appear inside the 3D rotating treasure chest on the hero section.
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {chestPicks.length} of 6 Selected
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {products.map((prod) => {
                const isPicked = Boolean(prod.chestPick);
                return (
                  <div
                    key={prod.id}
                    onClick={() => toggleChestPick(prod)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isPicked
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-border bg-background hover:border-primary/40'
                    }`}
                  >
                    <img
                      src={prod.images[0]}
                      alt={prod.name}
                      className="size-12 rounded object-cover border border-border shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-cocoa truncate">{prod.name}</p>
                      <p className="text-[0.7rem] text-terracotta">{formatPrice(prod.price)}</p>
                      <p className="text-[0.65rem] text-cocoa/60">{prod.category}</p>
                    </div>
                    <div
                      className={`size-6 rounded-full flex items-center justify-center shrink-0 border ${
                        isPicked
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-transparent'
                      }`}
                    >
                      <Check className="size-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Collection Rails */}
      {activeTab === 'rails' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-cocoa">Ready-To-Wear & Handbags Rails</h2>
            <p className="text-xs text-cocoa/70">
              Products automatically appear in these homepage rails based on their assigned category:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-border/70 p-4 bg-background space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-primary">Ready-To-Wear Rail</h3>
                  <span className="text-[0.7rem] text-cocoa/60">Category: womens-one-piece / upperwear</span>
                </div>
                <p className="text-xs text-cocoa/80">
                  {products.filter((p) => p.category === 'womens-one-piece' || p.category === 'womens-upperwear').length} items currently mapped to this rail.
                </p>
              </div>

              <div className="rounded-lg border border-border/70 p-4 bg-background space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-primary">Handbags & Small Craft Rail</h3>
                  <span className="text-[0.7rem] text-cocoa/60">Category: accessories</span>
                </div>
                <p className="text-xs text-cocoa/80">
                  {products.filter((p) => p.category === 'accessories').length} items currently mapped to this rail.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
