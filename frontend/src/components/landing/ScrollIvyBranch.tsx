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

/**
 * Generates a smooth, organic sinusoidal cubic-Bezier path in exact pixel coordinates.
 */
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
 * Renders a prominent, thick botanical English-ivy branch along the left paper
 * margin whose stem, tip bud, tendrils, and leaves grow in strict 1:1 sync with scroll.
 */
export function ScrollIvyBranch({ containerRef, className }: ScrollIvyBranchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stemPathRef = useRef<SVGPathElement>(null);

  const [size, setSize] = useState({ width: 108, height: 1200 });
  const [totalLength, setTotalLength] = useState(1250);
  const [leaves, setLeaves] = useState<LeafSpec[]>([]);
  const [progress, setProgress] = useState(0.1);
  const [tipPoint, setTipPoint] = useState({ x: 56, y: 120 });

  const pathD = buildOrganicVinePath(size.width, size.height);

  // Track exact rendered pixel dimensions of the vine overlay so SVG units === CSS pixels.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 100) {
        setSize((prev) =>
          Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: Math.round(rect.width), height: Math.round(rect.height) },
        );
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Recompute exact stem length and attach leaves directly onto sampled stem coordinates.
  useLayoutEffect(() => {
    const pathEl = stemPathRef.current;
    if (!pathEl || typeof pathEl.getTotalLength !== 'function') {
      return;
    }

    const total = pathEl.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return;
    setTotalLength(total);

    const leafCount = Math.max(14, Math.min(28, Math.round(size.height / 145)));
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

    setLeaves(nextLeaves);
  }, [pathD, size.height]);

  // Synchronize stem tip and leaf growth instantaneously on scroll via rAF.
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setProgress(1);
      return;
    }

    let rafId = 0;

    const updateScroll = () => {
      rafId = 0;
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const startTop = window.innerHeight * 0.55;
      const endTop = window.innerHeight * 0.85 - rect.height;
      const raw = (startTop - rect.top) / Math.max(startTop - endTop, 1);
      const next = clamp(raw, 0.07, 1);
      setProgress(next);
    };

    const schedule = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(updateScroll);
    };

    updateScroll();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef]);

  // Keep the growing shoot tip locked to the exact current stroke endpoint.
  useEffect(() => {
    const pathEl = stemPathRef.current;
    if (!pathEl || typeof pathEl.getPointAtLength !== 'function') return;
    const pt = pathEl.getPointAtLength(clamp(progress, 0, 1) * totalLength);
    setTipPoint({ x: pt.x, y: pt.y });
  }, [progress, totalLength]);

  const dashOffset = totalLength * (1 - progress);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none select-none absolute top-4 bottom-6 left-1 sm:left-2 z-10 hidden sm:block w-20 md:w-24 lg:w-28',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="h-full w-full overflow-visible"
      >
        {/* Subtle faint root guide along full stem */}
        <path
          d={pathD}
          fill="none"
          stroke="#2f3e24"
          strokeOpacity="0.08"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Soft botanical drop-shadow behind active growing branch */}
        <path
          d={pathD}
          fill="none"
          stroke="#182212"
          strokeOpacity="0.16"
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeDasharray={totalLength}
          strokeDashoffset={dashOffset}
          transform="translate(1.5, 2.5)"
        />

        {/* Primary thick woody ivy branch */}
        <path
          ref={stemPathRef}
          d={pathD}
          fill="none"
          stroke="#2a391f"
          strokeOpacity="0.95"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeDasharray={totalLength}
          strokeDashoffset={dashOffset}
        />

        {/* Crisp inner botanical highlight for 3D stem volume */}
        <path
          d={pathD}
          fill="none"
          stroke="#6d8555"
          strokeOpacity="0.55"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray={totalLength}
          strokeDashoffset={dashOffset}
          transform="translate(-0.8, 0)"
        />

        {/* Growing shoot bud locked directly to the active tip of the branch */}
        {progress > 0.02 && progress < 0.995 && (
          <g transform={`translate(${tipPoint.x}, ${tipPoint.y})`}>
            <circle r="4.5" fill="#465e33" />
            <path
              d="M 0 0 C -5 6, -3 13, 0 16 C 3 13, 5 6, 0 0 Z"
              fill="#5d7845"
            />
          </g>
        )}

        {/* Synchronized English ivy leaves & curling tendrils growing continuously with stem */}
        {leaves.map((leaf) => {
          // Smooth continuous 0..1 unfurl locked directly to stem tip passing leaf.t
          const grow = clamp((progress - (leaf.t - 0.015)) / 0.045, 0, 1);
          if (grow <= 0.01) return null;

          const eased = 1 - (1 - grow) * (1 - grow);
          const flipX = leaf.side === 'left' ? -1 : 1;
          const activeScale = leaf.scale * (0.18 + 0.82 * eased);
          const activeAngle = leaf.angleDeg * (0.4 + 0.6 * eased);

          return (
            <g
              key={leaf.id}
              transform={`translate(${leaf.x}, ${leaf.y})`}
              opacity={0.2 + 0.76 * eased}
            >
              {/* Optional delicate curly tendril */}
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
                  transform={`scale(${eased})`}
                />
              )}

              {/* Leaf anchored at exact petiole origin (0, 0) on the stem */}
              <g transform={`rotate(${activeAngle}) scale(${flipX * activeScale}, ${activeScale})`}>
                {/* Thick petiole connecting leaf cleanly into the branch */}
                <path
                  d="M -1 0 Q 6 -1 11 -1"
                  fill="none"
                  stroke="#2a391f"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
                {/* Soft leaf shadow */}
                <path
                  d="M 10 -1 C 11 -12, 20 -16, 26 -10 C 29 -16, 37 -12, 44 -3 C 38 3, 36 10, 30 14 C 26 10, 20 17, 14 13 C 10 9, 9 4, 10 -1 Z"
                  fill="#172111"
                  fillOpacity="0.16"
                  transform="translate(1.5, 2.5)"
                />
                {/* Lush 3-lobed English ivy leaf */}
                <path
                  d="M 10 -1 C 11 -12, 20 -16, 26 -10 C 29 -16, 37 -12, 44 -3 C 38 3, 36 10, 30 14 C 26 10, 20 17, 14 13 C 10 9, 9 4, 10 -1 Z"
                  fill={leaf.tone}
                  stroke="#1f2b16"
                  strokeWidth="0.9"
                />
                {/* Cream-ivory botanical veins matching CircleUp palette */}
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
          );
        })}
      </svg>
    </div>
  );
}
