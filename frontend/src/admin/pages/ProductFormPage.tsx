import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi, type AdminProductFormValues } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import {
  ArrowLeft,
  UploadCloud,
  X,
  Star,
  Ruler,
  Check,
  Sparkles,
  Save,
} from 'lucide-react';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  type InventoryStatusCode,
  SIZE_CHARTS,
  resolveSizeChartForCategory,
  extractCategoryCodeFromSerial,
} from '@circleup/shared';

interface ImageItem {
  url: string;
  altText: string;
  isCover: boolean;
}

export function ProductFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useAdminToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [originalPriceRupees, setOriginalPriceRupees] = useState('');
  const [compareAtPriceRupees, setCompareAtPriceRupees] = useState('');
  const [stock, setStock] = useState('1');
  const [categoryCode, setCategoryCode] = useState<string>('SET');
  const [sizeCategory, setSizeCategory] = useState<string>('top-bralette');
  const [measurementsData, setMeasurementsData] = useState<Record<string, string>>({});
  const [category, setCategory] = useState('womens-one-piece');
  const [subcategory, setSubcategory] = useState('Co-ords');
  const [condition, setCondition] = useState('Mint');
  const [gender, setGender] = useState('Women');
  const [badge, setBadge] = useState('');
  const [tagsStr, setTagsStr] = useState('thrift, vintage');
  const [featured, setFeatured] = useState(false);
  const [chestPick, setChestPick] = useState(false);
  const [status, setStatus] = useState<string>('AVAILABLE');

  // Sizes & Per-size stock
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['M']);
  const [sizeStocks, setSizeStocks] = useState<Record<string, number>>({ M: 1 });

  // Images with required alt text and cover flag
  const [images, setImages] = useState<ImageItem[]>([
    { url: '/assets/rtw-1.jpg', altText: 'Front view flat lay of garment', isCover: true },
  ]);
  const [isUploading, setIsUploading] = useState(false);

  // Auto-slug generator
  useEffect(() => {
    if (autoSlug && name) {
      const generated = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '');
      setSlug(generated);
    }
  }, [name, autoSlug]);

  // Load existing product if editing
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    async function loadProduct() {
      try {
        setIsLoading(true);
        const res = await adminApi.getProducts({ limit: 100, includeArchived: true });
        const found = res.data.find((p) => p.serialNumber === id || p.slug === id || p.id === id);
        if (found && mounted) {
          setName(found.name);
          setSlug(found.slug || '');
          setAutoSlug(false);
          setSerialNumber(found.serialNumber || '');
          setDescription(found.description || '');
          setPriceRupees(String(Math.round(found.price / 100)));
          if (found.originalPrice) setOriginalPriceRupees(String(Math.round(found.originalPrice / 100)));
          if (found.compareAtPrice) setCompareAtPriceRupees(String(Math.round(found.compareAtPrice / 100)));
          setStock(String(found.stock ?? 1));
          setCategory(found.category || 'womens-one-piece');
          setSubcategory(found.subcategory || '');
          setCondition(found.condition || 'Mint');
          setGender(found.gender || 'Women');
          setBadge(found.badge || '');
          setTagsStr((found.tags || []).join(', '));
          setFeatured(Boolean(found.featured));
          setChestPick(Boolean(found.chestPick));
          setStatus((found.status as string) || 'AVAILABLE');

          const code = (found as { categoryCode?: string }).categoryCode || extractCategoryCodeFromSerial(found.serialNumber || '');
          if (code && INVENTORY_CATEGORIES[code]) {
            setCategoryCode(code);
          }
          const sizeCat =
            (found as { sizeCategory?: string }).sizeCategory ||
            resolveSizeChartForCategory(code || found.category || '')?.id ||
            'top-bralette';
          setSizeCategory(sizeCat);

          const rawMeasData = (found as { measurementsData?: Record<string, string> }).measurementsData;
          if (rawMeasData && typeof rawMeasData === 'object') {
            setMeasurementsData(rawMeasData);
          } else if (found.measurements && typeof found.measurements === 'string') {
            // Best effort parse e.g. "Bust: 34 · Waist: 28"
            const parts = found.measurements.split('·').map((p) => p.trim());
            const parsed: Record<string, string> = {};
            parts.forEach((part) => {
              const [k, v] = part.split(':').map((s) => s.trim());
              if (k && v) parsed[k] = v.replace(/"/g, '');
            });
            if (Object.keys(parsed).length > 0) {
              setMeasurementsData(parsed);
            }
          }

          if (found.sizes && found.sizes.length > 0) {
            setSelectedSizes(found.sizes);
            const stocks: Record<string, number> = {};
            found.sizes.forEach((s) => {
              stocks[s] = Math.max(1, Math.floor((found.stock ?? 1) / found.sizes.length));
            });
            setSizeStocks(stocks);
          }

          if (found.images && found.images.length > 0) {
            setImages(
              found.images.map((img, idx) => ({
                url: img,
                altText: `${found.name} preview photo ${idx + 1}`,
                isCover: idx === 0,
              })),
            );
          }
        }
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to load product.', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadProduct();
    return () => {
      mounted = false;
    };
  }, [id, showToast]);

  // Warn on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const results = await adminApi.uploadMedia(Array.from(files));
      const newItems: ImageItem[] = results.map((r, i) => ({
        url: r.w800,
        altText: `${name || 'Product'} photo`,
        isCover: images.length === 0 && i === 0,
      }));
      setImages((prev) => [...prev, ...newItems]);
      setIsDirty(true);
      showToast(`${results.length} image(s) processed and optimized.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to upload images.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetCover = (index: number) => {
    setImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        isCover: i === index,
      })),
    );
    setIsDirty(true);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((img) => img.isCover) && next[0]) {
        next[0].isCover = true;
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleMoveImage = (index: number, direction: 'left' | 'right') => {
    const target = direction === 'left' ? index - 1 : index + 1;
    if (target < 0 || target >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      const targetItem = copy[target];
      if (temp && targetItem) {
        copy[index] = targetItem;
        copy[target] = temp;
      }
      return copy;
    });
    setIsDirty(true);
  };

  const handleCategoryCodeChange = (newCode: string) => {
    setCategoryCode(newCode);
    const meta = INVENTORY_CATEGORIES[newCode];
    if (meta) {
      if (!isEditing) {
        // Auto-prefix serial number
        setSerialNumber(`${newCode}-`);
      }
      setCategory(meta.defaultCategorySlug);
      setSubcategory(meta.name);
      if (meta.sizeChartType) {
        setSizeCategory(meta.sizeChartType);
      }
      if (meta.department === 'Men') setGender('Men');
      else if (meta.department === 'Women') setGender('Women');
      else if (meta.department === 'Unisex') setGender('Unisex');
    }
    setIsDirty(true);
  };

  const toggleSize = (sizeKey: string) => {
    setSelectedSizes((prev) => {
      const exists = prev.includes(sizeKey);
      const next = exists ? prev.filter((s) => s !== sizeKey) : [...prev, sizeKey];
      if (!exists && !sizeStocks[sizeKey]) {
        setSizeStocks((s) => ({ ...s, [sizeKey]: 1 }));
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Product name is required.', 'error');
      return;
    }
    const priceNum = Number(priceRupees);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('Please enter a valid price in rupees.', 'error');
      return;
    }
    if (images.length === 0) {
      showToast('Please add at least one product photo.', 'error');
      return;
    }

    // Required alt text validation for accessibility
    for (const img of images) {
      if (!img.altText || !img.altText.trim()) {
        showToast('All product images must have descriptive alt text for accessibility.', 'error');
        return;
      }
    }

    const priceInPaise = Math.round(priceNum * 100);
    const originalPriceInPaise = originalPriceRupees ? Math.round(Number(originalPriceRupees) * 100) : undefined;
    const compareAtPriceInPaise = compareAtPriceRupees ? Math.round(Number(compareAtPriceRupees) * 100) : undefined;

    // Arrange images so cover image is at index 0
    const sortedImages = [
      ...images.filter((img) => img.isCover).map((img) => img.url),
      ...images.filter((img) => !img.isCover).map((img) => img.url),
    ];

    // Compile clean measurements string e.g. "Bust: 34" · Waist: 28""
    const measurementsSummary = Object.entries(measurementsData)
      .filter(([_, val]) => Boolean(val && val.trim()))
      .map(([k, v]) => `${k}: ${v.trim().endsWith('"') ? v.trim() : `${v.trim()}"`}`)
      .join(' · ');

    const payload: AdminProductFormValues = {
      name: name.trim(),
      slug: slug.trim(),
      serialNumber: serialNumber.trim() || undefined,
      categoryCode,
      sizeCategory,
      measurementsData: Object.keys(measurementsData).length > 0 ? measurementsData : undefined,
      measurements: measurementsSummary || undefined,
      description: description.trim(),
      price: priceInPaise,
      originalPrice: originalPriceInPaise,
      compareAtPrice: compareAtPriceInPaise,
      stock: Number(stock) || 1,
      category,
      subcategory: subcategory.trim(),
      condition,
      gender,
      badge: badge.trim(),
      tags: tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      featured,
      chestPick,
      status,
      images: sortedImages,
      sizes: selectedSizes,
      variants: selectedSizes.map((s, idx) => ({
        id: `${(serialNumber || 'cu').toLowerCase()}-${s.toLowerCase()}-${idx}`,
        label: `Size ${s}`,
        size: s,
        stock: sizeStocks[s] || 1,
      })),
    };

    try {
      setIsSaving(true);
      if (isEditing && id) {
        await adminApi.updateProduct(id, payload);
        showToast(`Product ${name} updated successfully.`, 'success');
      } else {
        await adminApi.createProduct(payload);
        showToast(`Thrift piece ${name} added to catalog.`, 'success');
      }
      setIsDirty(false);
      navigate('/admin/products');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save product.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 animate-pulse space-y-6">
        <div className="h-8 bg-[#1e2a1c]/10 rounded w-1/3" />
        <div className="h-64 bg-[#1e2a1c]/5 rounded-3xl" />
      </div>
    );
  }

  const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'Free Size'];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e2a1c]/10">
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
            navigate('/admin/products');
          }}
          className="flex items-center gap-2 text-xs font-semibold text-[#8b5a3e] hover:text-[#1e2a1c] transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Products</span>
        </button>
        <span className="text-xs uppercase tracking-wider font-bold text-[#1e2a1c]/60">
          {isEditing ? `Editing: ${serialNumber}` : 'New Piece'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" onChange={() => setIsDirty(true)}>
        {/* Section 1: Basic Info */}
        <div className="p-6 sm:p-8 rounded-3xl border border-[#1e2a1c]/10 bg-white/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[#1e2a1c]/10 pb-2">
            <h3 className="font-serif text-lg font-bold text-[#1e2a1c]">
              1. Garment Details &amp; Thrift Inventory Code
            </h3>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#8b5a3e]">
              31 Standard Codes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Inventory Category Code Selector */}
            <div className="sm:col-span-2 p-4 rounded-2xl bg-[#1e2a1c]/5 border border-[#1e2a1c]/10 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]">
                  Inventory Category Code *
                </label>
                <span className="text-[0.68rem] text-[#8b5a3e] font-semibold">
                  Auto-prefixes Serial &amp; Silhouette Size Chart
                </span>
              </div>
              <select
                value={categoryCode}
                onChange={(e) => handleCategoryCodeChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              >
                {Object.values(INVENTORY_CATEGORIES).map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    [{cat.code}] {cat.name} ({cat.department}) — {cat.sizeChartType ? `Size Chart: ${cat.sizeChartType}` : 'No dimensions chart'}
                  </option>
                ))}
              </select>
              {INVENTORY_CATEGORIES[categoryCode]?.description && (
                <p className="text-[0.7rem] text-[#1e2a1c]/70 italic">
                  {INVENTORY_CATEGORIES[categoryCode].description}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vintage Silk Pleated Midi Skirt"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80">
                  URL Slug *
                </label>
                <button
                  type="button"
                  onClick={() => setAutoSlug((a) => !a)}
                  className="text-[0.68rem] text-[#8b5a3e] underline"
                >
                  {autoSlug ? 'Customize manually' : 'Auto-sync with name'}
                </button>
              </div>
              <input
                type="text"
                required
                value={slug}
                disabled={autoSlug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white/70 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e2a1c] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Serial Number / SKU
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                placeholder="Auto-generated (e.g. CU-042)"
                className="w-full px-3.5 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Description &amp; Story
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe fit, fabric composition, feel, and pre-loved vintage origin..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Inventory */}
        <div className="p-6 sm:p-8 rounded-3xl border border-[#1e2a1c]/10 bg-white/80 shadow-xs space-y-6">
          <h3 className="font-serif text-lg font-bold text-[#1e2a1c] border-b border-[#1e2a1c]/10 pb-2">
            2. Pricing &amp; Inventory (Stored in Paise)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Selling Price (₹) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={priceRupees}
                onChange={(e) => setPriceRupees(e.target.value)}
                placeholder="2550"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
              <span className="text-[0.68rem] text-[#1e2a1c]/60 mt-1 block">
                {priceRupees ? `Stored as ${Number(priceRupees) * 100} paise` : 'e.g. ₹2,550'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Compare-at / Tag Price (₹)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={compareAtPriceRupees}
                onChange={(e) => setCompareAtPriceRupees(e.target.value)}
                placeholder="4500"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Total Stock
              </label>
              <input
                type="number"
                required
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
              />
            </div>
          </div>

          {/* Sizes & Per-Size Allocation */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80">
              Sizes Available &amp; Per-Size Stock
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SIZES.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleSize(sz)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#1e2a1c] text-[#f8f4e2] shadow-xs'
                        : 'bg-[#1e2a1c]/5 text-[#1e2a1c] hover:bg-[#1e2a1c]/10'
                    }`}
                  >
                    {sz} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>

            {selectedSizes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {selectedSizes.map((sz) => (
                  <div key={sz} className="p-3 rounded-xl border border-[#1e2a1c]/10 bg-[#1e2a1c]/5 text-xs">
                    <span className="font-bold text-[#8b5a3e] block mb-1">Size {sz}</span>
                    <input
                      type="number"
                      min="0"
                      value={sizeStocks[sz] ?? 1}
                      onChange={(e) =>
                        setSizeStocks((prev) => ({ ...prev, [sz]: Number(e.target.value) || 0 }))
                      }
                      className="w-full px-2 py-1 rounded-lg border border-[#1e2a1c]/20 bg-white text-xs font-semibold"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Exact Flat-Lay Garment Measurements (Inches) */}
            <div className="pt-4 border-t border-[#1e2a1c]/10 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1e2a1c]">
                  <Ruler className="size-4 text-[#8b5a3e]" />
                  <span>Exact Flat-Lay Garment Measurements (Inches)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.68rem] text-[#1e2a1c]/70 font-medium">Silhouette:</span>
                  <select
                    value={sizeCategory}
                    onChange={(e) => {
                      setSizeCategory(e.target.value);
                      setIsDirty(true);
                    }}
                    className="px-2 py-1 rounded-lg border border-[#1e2a1c]/20 bg-white text-xs font-semibold"
                  >
                    <option value="women-blazer">Women Blazer (Bust, Waist, Shoulder, Sleeve)</option>
                    <option value="mens-blazer">Men's Blazer (Chest, Waist, Shoulder, Sleeve, Length)</option>
                    <option value="top-bralette">Top &amp; Bralettes (Bust, Underbust, Waist, Shoulder)</option>
                    <option value="mens-pants">Men's Pants (Waist, Hip, Inseam)</option>
                    <option value="dress">Dresses (Bust, Waist, Hip, Shoulder)</option>
                    <option value="skirt">Skirts (Waist, Hip)</option>
                  </select>
                </div>
              </div>

              {SIZE_CHARTS[sizeCategory] && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#faf7ee] p-3.5 rounded-2xl border border-[#1e2a1c]/10">
                  {SIZE_CHARTS[sizeCategory].dimensions.map((dim) => (
                    <div key={dim} className="space-y-1">
                      <label className="block text-[0.68rem] font-bold uppercase tracking-wider text-[#1e2a1c]/80">
                        {dim} (in)
                      </label>
                      <input
                        type="text"
                        value={measurementsData[dim] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMeasurementsData((prev) => ({ ...prev, [dim]: val }));
                          setIsDirty(true);
                        }}
                        placeholder='e.g. 34"'
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#1e2a1c]/20 bg-white text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Photos (Drag, Reorder, Cover, Required Alt Text) */}
        <div className="p-6 sm:p-8 rounded-3xl border border-[#1e2a1c]/10 bg-white/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[#1e2a1c]/10 pb-2">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1e2a1c]">3. Product Photography</h3>
              <p className="text-xs text-[#1e2a1c]/70">
                Rule: Hanging garments, flat lays, close-ups only. Zero person photos.
              </p>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold cursor-pointer hover:bg-[#1e2a1c]/90 transition-all shadow-xs">
              <UploadCloud className="size-4" />
              <span>{isUploading ? 'Uploading...' : 'Upload Photos'}</span>
              <input
                type="file"
                multiple
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>

          {images.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-[#1e2a1c]/20 bg-[#1e2a1c]/5 text-xs text-[#1e2a1c]/70">
              No photos added. Upload clean flat-lay or hanging garment photos (WebP, PNG, JPEG).
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {images.map((img, idx) => (
                <div
                  key={img.url + idx}
                  className={`p-3 rounded-2xl border transition-all space-y-2 relative bg-[#fcfbf7] ${
                    img.isCover ? 'border-[#1e2a1c] ring-2 ring-[#1e2a1c]/20' : 'border-[#1e2a1c]/15'
                  }`}
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-100 border border-[#1e2a1c]/10">
                    <img src={img.url} alt={img.altText} className="size-full object-cover" />
                    {img.isCover && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#1e2a1c] text-[#f8f4e2] text-[0.65rem] font-bold uppercase tracking-wider shadow-xs flex items-center gap-1">
                        <Star className="size-3 fill-current" /> Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-red-600 text-white shadow-xs hover:bg-red-700"
                      title="Remove image"
                    >
                      <X className="size-3" />
                    </button>
                  </div>

                  {/* Required Alt Text */}
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#8b5a3e] mb-0.5">
                      Alt Text * (Accessibility)
                    </label>
                    <input
                      type="text"
                      required
                      value={img.altText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setImages((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, altText: val } : it)),
                        );
                      }}
                      placeholder="e.g. Flat-lay photo of denim jacket"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#1e2a1c]/20 bg-white text-xs"
                    />
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center justify-between text-[0.68rem] pt-1">
                    {!img.isCover ? (
                      <button
                        type="button"
                        onClick={() => handleSetCover(idx)}
                        className="text-[#8b5a3e] font-semibold hover:underline"
                      >
                        Set as Cover
                      </button>
                    ) : (
                      <span className="text-emerald-800 font-bold flex items-center gap-0.5">
                        <Check className="size-3" /> Cover Photo
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveImage(idx, 'left')}
                        className="px-1.5 py-0.5 rounded bg-[#1e2a1c]/10 text-xs disabled:opacity-30"
                        title="Move left"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={idx === images.length - 1}
                        onClick={() => handleMoveImage(idx, 'right')}
                        className="px-1.5 py-0.5 rounded bg-[#1e2a1c]/10 text-xs disabled:opacity-30"
                        title="Move right"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Classification & Visibility */}
        <div className="p-6 sm:p-8 rounded-3xl border border-[#1e2a1c]/10 bg-white/80 shadow-xs space-y-6">
          <h3 className="font-serif text-lg font-bold text-[#1e2a1c] border-b border-[#1e2a1c]/10 pb-2">
            4. Taxonomy, Highlights &amp; Publishing
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs font-semibold focus:outline-none"
              >
                <option value="womens-one-piece">Women&apos;s One Piece</option>
                <option value="womens-upperwear">Women&apos;s Upperwear</option>
                <option value="womens-bottomwear">Women&apos;s Bottomwear</option>
                <option value="mens-upperwear">Men&apos;s Upperwear (Unisex)</option>
                <option value="mens-bottomwear">Men&apos;s Bottomwear (Unisex)</option>
                <option value="accessories">Accessories</option>
                <option value="rentals">Rentals</option>
                <option value="thrifted-treasure">Thrifted Treasure</option>
                <option value="handcrafted">Handcrafted</option>
                <option value="ethnic-wear">Ethnic Wear</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Subcategory
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Corsets, Co-ords, Knitwear"
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs font-semibold focus:outline-none"
              >
                <option value="Mint">Mint (Like New)</option>
                <option value="Gently Used">Gently Used</option>
                <option value="Vintage Worn">Vintage Worn (Character)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Badge / Ribbon
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="e.g. Rare 90s, Pure Silk"
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80">
                  Inventory &amp; Storefront Status
                </label>
                {INVENTORY_STATUSES[status as InventoryStatusCode] && (
                  <span
                    style={{
                      backgroundColor: INVENTORY_STATUSES[status as InventoryStatusCode].bgColor,
                      color: INVENTORY_STATUSES[status as InventoryStatusCode].textColor,
                      borderColor: INVENTORY_STATUSES[status as InventoryStatusCode].borderColor,
                    }}
                    className="text-[0.65rem] font-bold px-2 py-0.5 rounded border uppercase"
                  >
                    {INVENTORY_STATUSES[status as InventoryStatusCode].badgeText}
                  </span>
                )}
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs font-semibold focus:outline-none"
              >
                <option value="AVAILABLE">AVAILABLE — In Stock / Active</option>
                <option value="SOLD">SOLD — Sold Out (Light Green)</option>
                <option value="BOOKED">BOOKED — Reserved (Orange / Peach)</option>
                <option value="EXCHANGE_BARTER">EXCHANGE_BARTER — Circular Swap (Blue)</option>
                <option value="RENT">RENT — Rental Statements (Magenta / Pink)</option>
                <option value="NEED_ATTENTION">NEED_ATTENTION — Under Repair (Grey, Hidden)</option>
                <option value="MISSING">MISSING — Missing from Rack (Red, Hidden)</option>
                <option value="DRAFT">DRAFT — Draft (Admin only)</option>
                <option value="ARCHIVED">ARCHIVED — Soft Deleted</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Featured & Chest Pick Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#1e2a1c]/10">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-[#1e2a1c]/15 bg-[#1e2a1c]/5 cursor-pointer">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="mt-1 size-4 accent-[#1e2a1c]"
              />
              <div>
                <span className="font-bold text-xs text-[#1e2a1c] block">Featured Product</span>
                <span className="text-[0.68rem] text-[#1e2a1c]/70 block">
                  Shown in curated storefront highlight rails.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-[#1e2a1c]/15 bg-[#1e2a1c]/5 cursor-pointer">
              <input
                type="checkbox"
                checked={chestPick}
                onChange={(e) => setChestPick(e.target.checked)}
                className="mt-1 size-4 accent-[#1e2a1c]"
              />
              <div>
                <span className="font-bold text-xs text-[#1e2a1c] flex items-center gap-1">
                  <Sparkles className="size-3 text-[#8b5a3e]" />
                  Treasure Chest Pick (Homepage 3D)
                </span>
                <span className="text-[0.68rem] text-[#1e2a1c]/70 block">
                  Select as one of the 4–6 animated treasure chest cards on the homepage hero.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Submit Action Bar */}
        <div className="p-4 rounded-2xl bg-[#1e2a1c] text-[#f8f4e2] flex items-center justify-between shadow-lg sticky bottom-20 md:bottom-6 z-30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#f8f4e2] text-[#1e2a1c] text-xs font-bold hover:bg-white active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >
            <Save className="size-4" />
            <span>{isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Publish to Catalog'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProductFormPage;
