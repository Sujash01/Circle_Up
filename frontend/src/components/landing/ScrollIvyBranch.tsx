import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

interface ScrollIvyBranchProps {
  /** Reference to the scrollable content container the vine spans. */
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
}

interface LeafSpec {
  id: number;
  t: number;
  x: number;
  y: number;
  side: 'left' | 'right';
  scale: number;
  angleDeg: number;
  tone: string;
  hasTendril: boolean;
}

const LEAF_TONES = ['#28381d', '#334725', '#3e562e', '#2f3e24'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildOrganicVinePath(width: number, height: number): string {
  const centerX = width * 0.52;
  const amplitude = Math.min(18, width * 0.17);
  const segmentHeight = 175;
  const segments = Math.max(6, Math.round(height / segmentHeight));
  const stepY = height / segments;

  const commands: string[] = [`M ${centerX.toFixed(1)} 0`];

  for (let i = 0; i < segments; i++) {
    const y0 = i * stepY;
    const y1 = (i + 1) * stepY;
    const dir = i % 2 === 0 ? -1 : 1;
    const cx1 = centerX + dir * amplitude;
    const cy1 = y0 + stepY * 0.34;
    const cx2 = centerX - dir * amplitude;
    const cy2 = y0 + stepY * 0.66;
    const endX = centerX + dir * (amplitude * 0.18);
    commands.push(
      `C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${endX.toFixed(1)} ${y1.toFixed(1)}`,
    );
  }

  return commands.join(' ');
}

/**
 * Renders a prominent botanical English-ivy branch along the left paper margin.
 * All scroll-frame updates mutate SVG attributes directly via refs with cached
 * geometry and zero React re-renders so scrolling remains silky smooth.
 */
export function ScrollIvyBranch({ containerRef, className }: ScrollIvyBranchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stemPathRef = useRef<SVGPathElement>(null);
  const tipGroupRef = useRef<SVGGElement>(null);
  const leafGroupRefs = useRef<Array<SVGGElement | null>>([]);
  const leafBloomRefs = useRef<Array<SVGGElement | null>>([]);

  // Cached geometry & scroll metrics (avoids layout reflows and React renders on scroll)
  const metricsRef = useRef({
    totalLength: 1250,
    containerDocTop: 0,
    containerHeight: 1200,
    tipLookup: [] as Array<{ x: number; y: number }>,
    lastLeafGrow: [] as number[],
  });

  const [size, setSize] = useState({ width: 108, height: 1200 });
  const [leaves, setLeaves] = useState<LeafSpec[]>([]);

  const pathD = buildOrganicVinePath(size.width, size.height);

  // Measure rendered container dimensions on mount / resize only.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 100) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }

      const mainEl = containerRef.current;
      if (mainEl) {
        const mainRect = mainEl.getBoundingClientRect();
        metricsRef.current.containerDocTop = mainRect.top + window.scrollY;
        metricsRef.current.containerHeight = Math.max(mainRect.height, 1);
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, [containerRef]);

  // Pre-compute stem length, leaf anchor coordinates, and 100-point tip lookup table.
  useLayoutEffect(() => {
    const pathEl = stemPathRef.current;
    if (!pathEl || typeof pathEl.getTotalLength !== 'function') {
      return;
    }

    const total = pathEl.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return;

    metricsRef.current.totalLength = total;
    pathEl.style.strokeDasharray = `${total}`;

    const samples = 100;
    const tipLookup: Array<{ x: number; y: number }> = [];
    for (let s = 0; s <= samples; s++) {
      const pt = pathEl.getPointAtLength((s / samples) * total);
      tipLookup.push({ x: pt.x, y: pt.y });
    }
    metricsRef.current.tipLookup = tipLookup;

    const leafCount = Math.max(14, Math.min(26, Math.round(size.height / 155)));
    const nextLeaves: LeafSpec[] = [];

    for (let i = 0; i < leafCount; i++) {
      const t = 0.03 + (i / (leafCount - 1)) * 0.93;
      const len = t * total;
      const pt = pathEl.getPointAtLength(len);
      const ptBefore = pathEl.getPointAtLength(Math.max(0, len - 6));
      const ptAfter = pathEl.getPointAtLength(Math.min(total, len + 6));
      const tangentRad = Math.atan2(ptAfter.y - ptBefore.y, ptAfter.x - ptBefore.x);
      const tangentDeg = (tangentRad * 180) / Math.PI - 90;

      const side: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left';
      const baseAngle = side === 'right' ? 32 : -32;

      nextLeaves.push({
        id: i,
        t,
        x: pt.x,
        y: pt.y,
        side,
        scale: 0.9 + ((i * 7) % 5) * 0.06,
        angleDeg: baseAngle + tangentDeg * 0.45,
        tone: LEAF_TONES[i % LEAF_TONES.length] ?? '#2f3e24',
        hasTendril: i % 3 === 1,
      });
    }

    metricsRef.current.lastLeafGrow = new Array(nextLeaves.length).fill(-1);
    setLeaves(nextLeaves);
  }, [pathD, size.height]);

  // Direct DOM/SVG scroll loop: zero React state updates, zero getBoundingClientRect() on scroll.
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const applyProgress = (progress: number) => {
      const { totalLength, tipLookup, lastLeafGrow } = metricsRef.current;

      const stemEl = stemPathRef.current;
      if (stemEl) {
        stemEl.style.strokeDashoffset = `${totalLength * (1 - progress)}`;
      }

      const tipEl = tipGroupRef.current;
      if (tipEl && tipLookup.length > 0) {
        if (progress > 0.02 && progress < 0.995) {
          const idx = Math.min(
            tipLookup.length - 1,
            Math.max(0, Math.round(progress * (tipLookup.length - 1))),
          );
          const pt = tipLookup[idx];
          if (pt) {
            tipEl.setAttribute('transform', `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
            tipEl.style.opacity = '1';
          }
        } else {
          tipEl.style.opacity = '0';
        }
      }

      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const groupEl = leafGroupRefs.current[i];
        const bloomEl = leafBloomRefs.current[i];
        if (!leaf || !groupEl || !bloomEl) continue;

        const grow = clamp((progress - (leaf.t - 0.015)) / 0.045, 0, 1);
        const prevGrow = lastLeafGrow[i] ?? -1;
        // Skip DOM writes for leaves whose bloom state hasn't meaningfully changed.
        if (Math.abs(grow - prevGrow) < 0.005 && !(grow === 0 && prevGrow !== 0) && !(grow === 1 && prevGrow !== 1)) {
          continue;
        }
        lastLeafGrow[i] = grow;

        if (grow <= 0.01) {
          groupEl.style.opacity = '0';
          continue;
        }

        const eased = 1 - (1 - grow) * (1 - grow);
        const flipX = leaf.side === 'left' ? -1 : 1;
        const activeScale = leaf.scale * (0.18 + 0.82 * eased);
        const activeAngle = leaf.angleDeg * (0.4 + 0.6 * eased);

        groupEl.style.opacity = (0.2 + 0.78 * eased).toFixed(2);
        bloomEl.setAttribute(
          'transform',
          `rotate(${activeAngle.toFixed(1)}) scale(${(flipX * activeScale).toFixed(3)}, ${activeScale.toFixed(3)})`,
        );
      }
    };

    if (prefersReducedMotion) {
      applyProgress(1);
      return;
    }

    let rafId = 0;

    const computeAndApply = () => {
      rafId = 0;
      const { containerDocTop, containerHeight } = metricsRef.current;
      const currentRectTop = containerDocTop - window.scrollY;
      const startTop = window.innerHeight * 0.55;
      const endTop = window.innerHeight * 0.85 - containerHeight;
      const raw = (startTop - currentRectTop) / Math.max(startTop - endTop, 1);
      applyProgress(clamp(raw, 0.07, 1));
    };

    const schedule = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(computeAndApply);
    };

    computeAndApply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [leaves]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      style={{ contain: 'layout style', willChange: 'transform', transform: 'translateZ(0)' }}
      className={cn(
        'pointer-events-none select-none absolute top-4 bottom-6 left-1 sm:left-2 z-10 hidden sm:block w-20 md:w-24 lg:w-28',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="h-full w-full overflow-visible"
      >
        {/* Subtle static root guide */}
        <path
          d={pathD}
          fill="none"
          stroke="#2f3e24"
          strokeOpacity="0.08"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Single primary thick ivy branch (mutated directly via ref for 0-rerender scroll) */}
        <path
          ref={stemPathRef}
          d={pathD}
          fill="none"
          stroke="#2a391f"
          strokeOpacity="0.95"
          strokeWidth="5.5"
          strokeLinecap="round"
        />

        {/* Growing shoot bud at active tip */}
        <g ref={tipGroupRef} style={{ opacity: 0 }}>
          <circle r="4.5" fill="#465e33" />
          <path d="M 0 0 C -5 6, -3 13, 0 16 C 3 13, 5 6, 0 0 Z" fill="#5d7845" />
        </g>

        {/* Pre-mounted leaves updated only while actively blooming */}
        {leaves.map((leaf, index) => (
          <g
            key={leaf.id}
            ref={(el) => {
              leafGroupRefs.current[index] = el;
            }}
            transform={`translate(${leaf.x.toFixed(1)}, ${leaf.y.toFixed(1)})`}
            style={{ opacity: 0 }}
          >
            {leaf.hasTendril && (
              <path
                d={
                  leaf.side === 'right'
                    ? 'M 0 0 C -10 -4, -18 5, -14 14 C -11 19, -5 16, -8 11'
                    : 'M 0 0 C 10 -4, 18 5, 14 14 C 11 19, 5 16, 8 11'
                }
                fill="none"
                stroke="#3b4e2d"
                strokeOpacity="0.72"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}

            <g
              ref={(el) => {
                leafBloomRefs.current[index] = el;
              }}
            >
              <path
                d="M -1 0 Q 6 -1 11 -1"
                fill="none"
                stroke="#2a391f"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M 10 -1 C 11 -12, 20 -16, 26 -10 C 29 -16, 37 -12, 44 -3 C 38 3, 36 10, 30 14 C 26 10, 20 17, 14 13 C 10 9, 9 4, 10 -1 Z"
                fill={leaf.tone}
                stroke="#1f2b16"
                strokeWidth="0.9"
              />
              <path
                d="M 11 -1 L 37 -2 M 20 -1 L 25 -9 M 22 -1 L 29 9 M 16 0 L 18 8"
                fill="none"
                stroke="#f8f4e2"
                strokeOpacity="0.52"
                strokeWidth="1.15"
                strokeLinecap="round"
              />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
