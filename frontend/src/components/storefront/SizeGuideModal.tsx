import { useEffect, useState } from 'react';
import { Ruler, X, Info } from 'lucide-react';
import {
  SIZE_CHARTS,
  resolveSizeChartForCategory,
  type SizeChartDefinition,
} from '@circleup/shared';
import { cn } from '@/lib/utils';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryCode?: string;
  categorySlug?: string;
  productName?: string;
  measurementsData?: Record<string, string>;
  measurementsText?: string;
}

const CHART_TABS: Array<{ id: string; label: string }> = [
  { id: 'women-blazer', label: 'Women Blazer' },
  { id: 'mens-blazer', label: "Men's Blazer" },
  { id: 'top-bralette', label: 'Tops & Bralettes' },
  { id: 'mens-pants', label: "Men's Pants" },
  { id: 'dress', label: 'Dresses & Bodysuits' },
  { id: 'skirt', label: 'Skirts & Lowers' },
];

export function SizeGuideModal({
  isOpen,
  onClose,
  categoryCode,
  categorySlug,
  productName,
  measurementsData,
  measurementsText,
}: SizeGuideModalProps) {
  const initialResolved = resolveSizeChartForCategory(categoryCode || categorySlug || '')?.id || 'women-blazer';
  const [activeChartId, setActiveChartId] = useState<string>(initialResolved);

  // Sync active chart when modal opens with a specific item
  useEffect(() => {
    if (isOpen) {
      const resolved = resolveSizeChartForCategory(categoryCode || categorySlug || '');
      if (resolved && resolved.id) {
        setActiveChartId(resolved.id);
      }
    }
  }, [isOpen, categoryCode, categorySlug]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeChart: SizeChartDefinition = (SIZE_CHARTS[activeChartId] || SIZE_CHARTS['women-blazer'])!;
  const hasExactMeasurements = measurementsData && Object.keys(measurementsData).length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="size-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#faf7ee] border border-[#1e2a1c]/20 shadow-2xl rounded-2xl p-6 sm:p-8 space-y-6 text-[#2c221e]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1e2a1c]/15 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#8b5a3e] font-semibold">
              <Ruler className="size-4" />
              <span>Official CircleUp Sizing System</span>
            </div>
            <h2 id="size-guide-title" className="font-display text-2xl sm:text-3xl text-[#1e2a1c]">
              Garment Size &amp; Measurement Guide
            </h2>
            {productName && (
              <p className="text-xs text-[#2c221e]/70">
                Sizing reference for: <span className="font-medium text-[#1e2a1c]">{productName}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close size guide"
            className="p-2 rounded-full text-[#2c221e]/60 hover:text-[#1e2a1c] hover:bg-[#1e2a1c]/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Exact Garment Measurements Callout (if available for current product) */}
        {(hasExactMeasurements || measurementsText) && (
          <div className="rounded-xl border border-[#1e2a1c]/15 bg-[#f0ebd9] p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1e2a1c]">
              <span className="size-2 rounded-full bg-[#1e2a1c]" />
              <span>Exact Flat-Lay Measurements for this Piece</span>
            </div>
            {hasExactMeasurements && measurementsData ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {Object.entries(measurementsData).map(([key, val]) => (
                  <div key={key} className="bg-white/80 p-2.5 rounded-lg border border-[#1e2a1c]/10 text-center">
                    <span className="block text-[0.68rem] uppercase font-bold text-[#8b5a3e] tracking-wider">
                      {key}
                    </span>
                    <span className="font-mono text-sm font-bold text-[#1e2a1c]">
                      {val.includes('"') || val.toLowerCase().includes('in') ? val : `${val}"`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs text-[#1e2a1c] bg-white/70 p-2.5 rounded-lg">
                {measurementsText}
              </p>
            )}
          </div>
        )}

        {/* Tab switcher across the 6 silhouette charts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-[#8b5a3e]">
              Select Garment Silhouette
            </span>
            <span className="text-[0.72rem] text-[#2c221e]/60 italic">All measurements in inches (in)</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {CHART_TABS.map((tab) => {
              const isActive = activeChartId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveChartId(tab.id)}
                  className={cn(
                    'px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors border',
                    isActive
                      ? 'bg-[#1e2a1c] text-[#faf7ee] border-[#1e2a1c] shadow-xs'
                      : 'bg-white/60 text-[#2c221e] border-[#1e2a1c]/15 hover:border-[#1e2a1c]/40',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Measurement Table */}
        <div className="border border-[#1e2a1c]/15 rounded-xl overflow-hidden bg-white/90 shadow-xs">
          <div className="bg-[#e9e3cf] px-4 py-2.5 border-b border-[#1e2a1c]/15 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-serif text-sm font-bold text-[#1e2a1c]">
              {activeChart.title}
            </h3>
            <span className="text-[0.72rem] text-[#8b5a3e] font-medium">
              Fits: {activeChart.targetGarments}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#f5f0df] text-[#1e2a1c] border-b border-[#1e2a1c]/15 uppercase font-bold tracking-wider text-[0.7rem]">
                  <th className="py-2.5 px-4 font-bold border-r border-[#1e2a1c]/10">Size Tag</th>
                  {activeChart.dimensions.map((dim) => (
                    <th key={dim} className="py-2.5 px-4 font-bold border-r border-[#1e2a1c]/10 last:border-r-0">
                      {dim} (in)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a1c]/10">
                {activeChart.rows.map((row, idx) => (
                  <tr
                    key={row.size}
                    className={cn(
                      'hover:bg-[#faf6ea] transition-colors',
                      idx % 2 === 1 && 'bg-[#faf8f2]',
                    )}
                  >
                    <td className="py-2.5 px-4 font-bold text-[#1e2a1c] border-r border-[#1e2a1c]/10">
                      <span className="inline-block px-2 py-0.5 rounded-sm bg-[#1e2a1c]/10 font-mono text-xs">
                        {row.size}
                      </span>
                    </td>
                    {activeChart.dimensions.map((dim) => (
                      <td key={dim} className="py-2.5 px-4 font-mono text-[#2c221e] border-r border-[#1e2a1c]/10 last:border-r-0">
                        {row[dim] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vintage Measuring Flat Tips */}
        <div className="border-t border-[#1e2a1c]/15 pt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8b5a3e]">
            <Info className="size-4" />
            <span>How to Measure Vintage Garments</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs leading-relaxed text-[#2c221e]/85">
            <div className="bg-white/60 p-3 rounded-lg border border-[#1e2a1c]/10 space-y-1">
              <span className="font-bold text-[#1e2a1c] block">Chest / Bust</span>
              <p>Lay garment completely flat. Measure armpit seam to armpit seam straight across, then multiply by two.</p>
            </div>
            <div className="bg-white/60 p-3 rounded-lg border border-[#1e2a1c]/10 space-y-1">
              <span className="font-bold text-[#1e2a1c] block">Waist &amp; Hip</span>
              <p>For trousers and skirts, measure straight across the waistband and widest hip point, then multiply by two.</p>
            </div>
            <div className="bg-white/60 p-3 rounded-lg border border-[#1e2a1c]/10 space-y-1">
              <span className="font-bold text-[#1e2a1c] block">Shoulder &amp; Sleeve</span>
              <p>Shoulder: seam to seam across back. Sleeve: shoulder seam down outer sleeve to finished cuff edge.</p>
            </div>
          </div>

          <p className="text-[0.72rem] text-[#2c221e]/70 italic border-l-2 border-[#8b5a3e] pl-3 py-0.5">
            Note: Vintage tags may vary from contemporary fast-fashion sizing due to era shrinkage and tailored cuts. For best fit, compare these inches against your best-fitting personal garment.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-[#1e2a1c] text-[#faf7ee] hover:bg-[#2e3f2c] transition-colors rounded-lg"
          >
            Got it, Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
