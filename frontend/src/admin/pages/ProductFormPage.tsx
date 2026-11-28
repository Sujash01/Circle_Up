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
  Sparkles,
  Save,
} from 'lucide-react';
import {
  type Product,
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  type InventoryStatusCode,
  SIZE_CHARTS,
  resolveSizeChartForCategory,
  extractCategoryCodeFromSerial,
  convertRupeesToPaise,
  NEW_PRODUCT_MIN_STOCK,
  NEW_PRODUCT_MIN_STOCK_MESSAGE,
  requiresNewProductMinStock,
} from '@circleup/shared';

interface ProductDraftSnapshot {
  savedAt: string;
  name: string;
  slug: string;
  autoSlug: boolean;
  serialNumber: string;
  description: string;
  priceRupees: string;
  originalPriceRupees: string;
  compareAtPriceRupees: string;
  stock: string;
  categoryCode: string;
  sizeCategory: string;
  measurementsData: Record<string, string>;
  category: string;
  subcategory: string;
  condition: string;
  gender: string;
  badge: string;
  tagsStr: string;
  featured: boolean;
  chestPick: boolean;
  status: string;
  selectedSizes: string[];
  sizeStocks: Record<string, number>;
  variantPrices: Record<string, number | undefined>;
  variantMeasurements: Record<string, Record<string, string>>;
  images: ImageItem[];
}

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
  const [stockError, setStockError] = useState('');
  const [pendingDraft, setPendingDraft] = useState<ProductDraftSnapshot | null>(null);
  const draftStorageKey = `circleup_admin_product_draft:${isEditing && id ? `edit:${id}` : 'new'}`;

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

  // Sizes & Per-size stock / variant metadata
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['M']);
  const [sizeStocks, setSizeStocks] = useState<Record<string, number>>({ M: 1 });
  const [variantIds, setVariantIds] = useState<Record<string, string>>({});
  const [variantPrices, setVariantPrices] = useState<Record<string, number | undefined>>({});
  const [variantMeasurements, setVariantMeasurements] = useState<Record<string, Record<string, string>>>({});
  const [customSizeInput, setCustomSizeInput] = useState('');

  // Images with required alt text and cover flag
  const [images, setImages] = useState<ImageItem[]>([]);
  const [persistedImageUrls, setPersistedImageUrls] = useState<string[]>([]);
  const [newUploadUrls, setNewUploadUrls] = useState<string[]>([]);
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
    const productId = id;
    let mounted = true;
    async function loadProduct() {
      try {
        setIsLoading(true);
        let found: Product | null = null;
        try {
          found = await adminApi.getProduct(productId);
        } catch {
          // Fallback to searching product list by serialNumber, slug, or ID
          const res = await adminApi.getProducts({ limit: 100, includeArchived: true, includeDeleted: true });
          found =
            res.data.find(
              (p) =>
                p.serialNumber?.toLowerCase() === productId.toLowerCase() ||
                p.slug?.toLowerCase() === productId.toLowerCase() ||
                p.id?.toLowerCase() === productId.toLowerCase(),
            ) || null;
        }

        if (!found) {
          if (mounted) {
            showToast(`Product "${productId}" could not be found.`, 'error');
            navigate('/admin/products');
          }
          return;
        }

        if (mounted) {
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
          const rawSizeCat =
            (found as { sizeCategory?: string }).sizeCategory ||
            resolveSizeChartForCategory(code || found.category || '')?.id ||
            'top-bralette';
          const sizeCat =
            rawSizeCat === 'men-blazer'
              ? 'mens-blazer'
              : rawSizeCat === 'men-pants'
                ? 'mens-pants'
                : rawSizeCat;
          setSizeCategory(sizeCat);

          const rawMeasData = (found as { measurementsData?: Record<string, string> }).measurementsData;
          if (rawMeasData && typeof rawMeasData === 'object') {
            setMeasurementsData(rawMeasData);
          } else if (found.measurements && typeof found.measurements === 'string') {
            // Best effort parse e.g. "Bust: 34 · Waist: 28"
            const parts = found.measurements.split('·').map((p: string) => p.trim());
            const parsed: Record<string, string> = {};
            parts.forEach((part: string) => {
              const [k, v] = part.split(':').map((s: string) => s.trim());
              if (k && v) parsed[k] = v.replace(/"/g, '');
            });
            if (Object.keys(parsed).length > 0) {
              setMeasurementsData(parsed);
            }
          }

          if (Array.isArray(found.variants) && found.variants.length > 0) {
            const sizesList: string[] = [];
            const stocks: Record<string, number> = {};
            const ids: Record<string, string> = {};
            const prices: Record<string, number | undefined> = {};
            const meas: Record<string, Record<string, string>> = {};
            found.variants.forEach((v) => {
              const sz = v.size || v.label || 'One Size';
              if (!sizesList.includes(sz)) sizesList.push(sz);
              stocks[sz] = Math.max(0, Number(v.stock ?? 0));
              if (v.id) ids[sz] = v.id;
              if (v.priceOverride !== undefined) prices[sz] = v.priceOverride;
              if (v.measurements && typeof v.measurements === 'object') {
                meas[sz] = Object.fromEntries(
                  Object.entries(v.measurements).map(([k, val]) => [k, String(val ?? '')]),
                );
              }
            });
            setSelectedSizes(sizesList);
            setSizeStocks(stocks);
            setVariantIds(ids);
            setVariantPrices(prices);
            setVariantMeasurements(meas);
          } else if (found.sizes && found.sizes.length > 0) {
            setSelectedSizes(found.sizes);
            const stocks: Record<string, number> = {};
            const total = Math.max(0, Number(found.stock ?? 0));
            found.sizes.forEach((s: string) => {
              stocks[s] = total === 0 ? 0 : Math.max(1, Math.floor(total / found.sizes.length));
            });
            setSizeStocks(stocks);
          }

          if (found.images && found.images.length > 0) {
            setPersistedImageUrls(found.images);
            setImages(
              found.images.map((img: string, idx: number) => ({
                url: img,
                altText: `${found.name} preview photo ${idx + 1}`,
                isCover: idx === 0,
              })),
            );
          } else {
            setPersistedImageUrls([]);
            setImages([]);
          }
        }
      } catch (err: unknown) {
        if (mounted) {
          showToast(err instanceof Error ? err.message : 'Failed to load product.', 'error');
          navigate('/admin/products');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadProduct();
    return () => {
      mounted = false;
    };
  }, [id, showToast, navigate]);

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

  // Check for saved draft (never auto-overwrite actively edited or loaded fields)
  useEffect(() => {
    if (isLoading || isDirty) return;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ProductDraftSnapshot;
      if (parsed && typeof parsed === 'object' && typeof parsed.savedAt === 'string') {
        setPendingDraft(parsed);
      }
    } catch {
      // Ignore corrupt draft storage
    }
  }, [draftStorageKey, isLoading, isDirty]);

  // Auto-save form draft (strictly form fields, never auth tokens) when dirty
  useEffect(() => {
    if (!isDirty || isLoading || isSaving) return;
    const timer = window.setTimeout(() => {
      try {
        const snapshot: ProductDraftSnapshot = {
          savedAt: new Date().toISOString(),
          name,
          slug,
          autoSlug,
          serialNumber,
          description,
          priceRupees,
          originalPriceRupees,
          compareAtPriceRupees,
          stock,
          categoryCode,
          sizeCategory,
          measurementsData,
          category,
          subcategory,
          condition,
          gender,
          badge,
          tagsStr,
          featured,
          chestPick,
          status,
          selectedSizes,
          sizeStocks,
          variantPrices,
          variantMeasurements,
          images,
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(snapshot));
      } catch {
        // Ignore storage quota errors
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    isDirty,
    isLoading,
    isSaving,
    draftStorageKey,
    name,
    slug,
    autoSlug,
    serialNumber,
    description,
    priceRupees,
    originalPriceRupees,
    compareAtPriceRupees,
    stock,
    categoryCode,
    sizeCategory,
    measurementsData,
    category,
    subcategory,
    condition,
    gender,
    badge,
    tagsStr,
    featured,
    chestPick,
    status,
    selectedSizes,
    sizeStocks,
    variantPrices,
    variantMeasurements,
    images,
  ]);

  const handleRestoreDraft = () => {
    if (!pendingDraft) return;
    setName(pendingDraft.name ?? '');
    setSlug(pendingDraft.slug ?? '');
    setAutoSlug(Boolean(pendingDraft.autoSlug));
    setSerialNumber(pendingDraft.serialNumber ?? '');
    setDescription(pendingDraft.description ?? '');
    setPriceRupees(pendingDraft.priceRupees ?? '');
    setOriginalPriceRupees(pendingDraft.originalPriceRupees ?? '');
    setCompareAtPriceRupees(pendingDraft.compareAtPriceRupees ?? '');
    setStock(pendingDraft.stock ?? '1');
    setCategoryCode(pendingDraft.categoryCode ?? 'SET');
    setSizeCategory(pendingDraft.sizeCategory ?? 'top-bralette');
    setMeasurementsData(pendingDraft.measurementsData ?? {});
    setCategory(pendingDraft.category ?? 'womens-one-piece');
    setSubcategory(pendingDraft.subcategory ?? '');
    setCondition(pendingDraft.condition ?? 'Mint');
    setGender(pendingDraft.gender ?? 'Women');
    setBadge(pendingDraft.badge ?? '');
    setTagsStr(pendingDraft.tagsStr ?? '');
    setFeatured(Boolean(pendingDraft.featured));
    setChestPick(Boolean(pendingDraft.chestPick));
    setStatus(pendingDraft.status ?? 'AVAILABLE');
    setSelectedSizes(Array.isArray(pendingDraft.selectedSizes) ? pendingDraft.selectedSizes : ['M']);
    setSizeStocks(pendingDraft.sizeStocks ?? { M: 1 });
    setVariantPrices(pendingDraft.variantPrices ?? {});
    setVariantMeasurements(pendingDraft.variantMeasurements ?? {});
    setImages(Array.isArray(pendingDraft.images) ? pendingDraft.images : []);
    setPendingDraft(null);
    setIsDirty(true);
    showToast('Unsaved product draft restored.', 'info');
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }
    setPendingDraft(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const results = await adminApi.uploadMedia(Array.from(files));
      setNewUploadUrls((current) => [...current, ...results.map((result) => result.w800)]);
      setImages((prev) => {
        const hasCoverAlready = prev.some((img) => img.isCover);
        const newItems: ImageItem[] = results.map((r, i) => ({
          url: r.w800,
          altText: `${name || 'Product'} photo ${prev.length + i + 1}`,
          isCover: !hasCoverAlready && i === 0,
        }));
        return [...prev, ...newItems];
      });
      setIsDirty(true);
      showToast(`${results.length} image(s) processed and optimized.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to upload images.', 'error');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
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
      const nextStocks = { ...sizeStocks };
      if (!exists && nextStocks[sizeKey] === undefined) {
        nextStocks[sizeKey] = 1;
        setSizeStocks(nextStocks);
      }
      if (next.length > 0) {
        const summed = next.reduce((sum, s) => sum + Math.max(0, nextStocks[s] ?? 0), 0);
        setStock(String(summed));
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleAddCustomSize = () => {
    const label = customSizeInput.trim();
    if (!label) return;
    if (!selectedSizes.includes(label)) {
      const next = [...selectedSizes, label];
      const nextStocks = { ...sizeStocks, [label]: sizeStocks[label] ?? 1 };
      setSelectedSizes(next);
      setSizeStocks(nextStocks);
      const summed = next.reduce((sum, s) => sum + Math.max(0, nextStocks[s] ?? 0), 0);
      setStock(String(summed));
      setIsDirty(true);
    }
    setCustomSizeInput('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Product name is required.', 'error');
      return;
    }
    let priceInPaise: number;
    try {
      priceInPaise = convertRupeesToPaise(priceRupees);
    } catch {
      showToast('Please enter a valid price in rupees (e.g. 700, ₹700, or 700 (Rental)).', 'error');
      return;
    }

    const parsedManualStock = Number(stock);
    const totalVariantStock = selectedSizes.length > 0
      ? selectedSizes.reduce((sum, s) => sum + Math.max(0, Number(sizeStocks[s] ?? 0)), 0)
      : Math.max(0, Number.isFinite(parsedManualStock) ? parsedManualStock : 0);

    if (!isEditing && requiresNewProductMinStock({ category, condition }) && totalVariantStock < NEW_PRODUCT_MIN_STOCK) {
      setStockError(NEW_PRODUCT_MIN_STOCK_MESSAGE);
      showToast(NEW_PRODUCT_MIN_STOCK_MESSAGE, 'error');
      return;
    }
    setStockError('');

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

    let originalPriceInPaise: number | undefined;
    if (originalPriceRupees && originalPriceRupees.trim()) {
      try {
        originalPriceInPaise = convertRupeesToPaise(originalPriceRupees);
      } catch {
        originalPriceInPaise = undefined;
      }
    }

    let compareAtPriceInPaise: number | undefined;
    if (compareAtPriceRupees && compareAtPriceRupees.trim()) {
      try {
        compareAtPriceInPaise = convertRupeesToPaise(compareAtPriceRupees);
      } catch {
        compareAtPriceInPaise = undefined;
      }
    }

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
      stock: totalVariantStock,
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
      variants: selectedSizes.map((s, idx) => {
        const perSizeMeas = variantMeasurements[s];
        const cleanPerSizeMeas = perSizeMeas
          ? Object.fromEntries(Object.entries(perSizeMeas).filter(([, v]) => Boolean(v && v.trim())))
          : undefined;
        return {
          id: variantIds[s] || `${(serialNumber || 'cu').toLowerCase()}-${s.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${idx}`,
          label: `Size ${s}`,
          size: s,
          stock: Math.max(0, Number(sizeStocks[s] ?? 0)),
          ...(variantPrices[s] !== undefined ? { priceOverride: variantPrices[s] } : {}),
          ...(cleanPerSizeMeas && Object.keys(cleanPerSizeMeas).length > 0 ? { measurements: cleanPerSizeMeas } : {}),
        };
      }),
    };

    try {
      setIsSaving(true);
      if (isEditing && id) {
        await adminApi.updateProduct(serialNumber || id, payload);
      } else {
        await adminApi.createProduct(payload);
      }
      const removedMedia = [...new Set([...persistedImageUrls, ...newUploadUrls])]
        .filter((url) => !sortedImages.includes(url) && url.includes('/storage/v1/object/public/product-images/'));
      const cleanup = await Promise.allSettled(removedMedia.map((url) => adminApi.deleteMedia(url)));
      const cleanupFailed = cleanup.some((result) => result.status === 'rejected');
      showToast(
        cleanupFailed
          ? `Product ${name} saved. Some unused images could not be removed.`
          : isEditing ? `Product ${name} updated successfully.` : `Thrift piece ${name} added to catalog.`,
        cleanupFailed ? 'info' : 'success',
      );
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }
      setPendingDraft(null);
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

  const STANDARD_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size', 'One Size'];
  const NUMERIC_SIZES = ['28', '30', '32', '34', '36', '38'];
  const PRESET_SIZES = [...STANDARD_SIZES, ...NUMERIC_SIZES];
  const CUSTOM_SELECTED_SIZES = selectedSizes.filter((s) => !PRESET_SIZES.includes(s));
  const ALL_SIZES = [...PRESET_SIZES, ...CUSTOM_SELECTED_SIZES];

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

      {pendingDraft && (
        <div
          role="status"
          className="rounded-2xl border border-[#8b5a3e]/30 bg-amber-50/90 px-4 py-3 text-xs text-[#1e2a1c] flex flex-wrap items-center justify-between gap-3 shadow-xs"
        >
          <span>
            Unsaved product draft found{pendingDraft.name ? ` ("${pendingDraft.name}")` : ''}. Would you like to restore it?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-3 py-1.5 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] font-semibold hover:bg-[#1e2a1c]/90"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 rounded-xl border border-[#1e2a1c]/20 bg-white font-semibold hover:bg-[#1e2a1c]/5"
            >
              Discard Draft
            </button>
          </div>
        </div>
      )}

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
                readOnly={selectedSizes.length > 1}
                value={stock}
                onChange={(e) => {
                  const raw = e.target.value;
                  setStock(raw);
                  setStockError('');
                  const onlySize = selectedSizes[0];
                  if (selectedSizes.length === 1 && onlySize) {
                    const parsed = Math.max(0, Number(raw) || 0);
                    setSizeStocks({ ...sizeStocks, [onlySize]: parsed });
                  }
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e2a1c] read-only:bg-[#1e2a1c]/5"
              />
              {selectedSizes.length > 1 && (
                <p className="text-[0.65rem] text-[#1e2a1c]/60 mt-1">
                  Auto-summed from per-size stock below.
                </p>
              )}
              {!isEditing && requiresNewProductMinStock({ category, condition }) && (
                <p className="text-[0.65rem] text-[#8b5a3e] font-semibold mt-1">
                  New products require a minimum total stock of {NEW_PRODUCT_MIN_STOCK}.
                </p>
              )}
              {stockError && (
                <p role="alert" className="text-xs font-semibold text-red-700 mt-1">
                  {stockError}
                </p>
              )}
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${isSelected
                      ? 'bg-[#1e2a1c] text-[#f8f4e2] shadow-xs'
                      : 'bg-[#1e2a1c]/5 text-[#1e2a1c] hover:bg-[#1e2a1c]/10'
                      }`}
                  >
                    {sz} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="text"
                value={customSizeInput}
                onChange={(e) => setCustomSizeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomSize();
                  }
                }}
                placeholder="Custom size (e.g. UK 6, S-M, 40)"
                className="px-3 py-1.5 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
              />
              <button
                type="button"
                onClick={handleAddCustomSize}
                className="px-3 py-1.5 rounded-xl bg-[#8b5a3e] text-[#f8f4e2] text-xs font-semibold hover:bg-[#8b5a3e]/90 transition-colors"
              >
                Add Size
              </button>
            </div>

            {selectedSizes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {selectedSizes.map((sz) => (
                  <div key={sz} className="p-3 rounded-xl border border-[#1e2a1c]/10 bg-[#1e2a1c]/5 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#8b5a3e]">Size {sz}</span>
                      <button
                        type="button"
                        onClick={() => toggleSize(sz)}
                        className="text-[0.65rem] text-red-700 hover:underline font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                    <div>
                      <label className="block text-[0.65rem] font-semibold text-[#1e2a1c]/70 mb-0.5">Stock</label>
                      <input
                        type="number"
                        min="0"
                        value={sizeStocks[sz] ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          const nextStocks = { ...sizeStocks, [sz]: val };
                          setSizeStocks(nextStocks);
                          const summed = selectedSizes.reduce((sum, s) => sum + Math.max(0, nextStocks[s] ?? 0), 0);
                          setStock(String(summed));
                          setIsDirty(true);
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-[#1e2a1c]/20 bg-white text-xs font-semibold"
                      />
                    </div>
                    {SIZE_CHARTS[sizeCategory] && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#1e2a1c]/10">
                        {SIZE_CHARTS[sizeCategory].dimensions.map((dim) => (
                          <div key={dim}>
                            <label className="block text-[0.6rem] uppercase font-bold text-[#1e2a1c]/60">
                              {dim}
                            </label>
                            <input
                              type="text"
                              value={variantMeasurements[sz]?.[dim] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariantMeasurements((prev) => ({
                                  ...prev,
                                  [sz]: { ...(prev[sz] || {}), [dim]: val },
                                }));
                                setIsDirty(true);
                              }}
                              placeholder={measurementsData[dim] || 'in'}
                              className="w-full px-1.5 py-0.5 rounded border border-[#1e2a1c]/15 bg-white text-[0.68rem] font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    )}
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
                  className={`p-3 rounded-2xl border transition-all space-y-2 relative bg-[#fcfbf7] ${img.isCover ? 'border-[#1e2a1c] ring-2 ring-[#1e2a1c]/20' : 'border-[#1e2a1c]/15'
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
                placeholder={
                  category === 'thrifted-treasure'
                    ? 'e.g. Books, Toys, Electronics & Radio, Collectibles, Home & Living'
                    : 'e.g. Corsets, Co-ords, Knitwear'
                }
                className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none"
              />
              {category === 'thrifted-treasure' && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Books', 'Toys', 'Electronics & Radio', 'Collectibles', 'Home & Living', 'One-Off Finds', 'Other'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSubcategory(preset);
                        setIsDirty(true);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border transition-colors ${
                        subcategory === preset
                          ? 'bg-[#1e2a1c] text-[#f8f4e2] border-[#1e2a1c]'
                          : 'bg-[#1e2a1c]/5 text-[#1e2a1c] border-[#1e2a1c]/15 hover:bg-[#1e2a1c]/10'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
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
                <option value="New With Tags">New With Tags</option>
                <option value="Mint">Mint (Like New)</option>
                <option value="Gently Used">Gently Used</option>
                <option value="Vintage Wear">Vintage Wear (Character)</option>
                <option value="Artisan Made">Artisan Made</option>
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
              onClick={() => {
                if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
                handleDiscardDraft();
                navigate('/admin/products');
              }}
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
