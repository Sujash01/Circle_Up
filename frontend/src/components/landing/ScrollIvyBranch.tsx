import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

interface ScrollIvyBranchProps {
  /** Reference to the scrollable content container the vine spans. */
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
}

interface LeafNode {
  id: number;
  threshold: number;
  xPct: number;
  yPct: number;
  side: 'left' | 'right';
  scale: number;
  angle: number;
  tone: string;
}

// Single continuous organic vine path in a 0..80 x 0..1000 coordinate space.
const VINE_PATH_D = [
  'M 34 0',
  'C 22 45, 48 95, 34 145',
  'C 20 195, 46 245, 32 295',
  'C 18 345, 48 395, 35 445',
  'C 22 495, 46 545, 31 595',
  'C 17 645, 48 695, 34 745',
  'C 20 795, 46 845, 32 895',
  'C 22 935, 42 968, 35 1000',
].join(' ');

const LEAF_TONES = ['#2f3e24', '#3b4e2e', '#4c623c', '#344528'];

const LEAF_STATIONS: ReadonlyArray<{
  threshold: number;
  side: 'left' | 'right';
  scale: number;
  tilt: number;
}> = [
  { threshold: 0.05, side: 'right', scale: 0.85, tilt: 28 },
  { threshold: 0.1, side: 'left', scale: 0.95, tilt: -34 },
  { threshold: 0.16, side: 'right', scale: 1.05, tilt: 40 },
  { threshold: 0.22, side: 'left', scale: 0.9, tilt: -26 },
  { threshold: 0.28, side: 'right', scale: 1.0, tilt: 32 },
  { threshold: 0.34, side: 'left', scale: 1.1, tilt: -38 },
  { threshold: 0.4, side: 'right', scale: 0.88, tilt: 24 },
  { threshold: 0.46, side: 'left', scale: 1.02, tilt: -30 },
  { threshold: 0.52, side: 'right', scale: 1.08, tilt: 36 },
  { threshold: 0.58, side: 'left', scale: 0.92, tilt: -28 },
  { threshold: 0.64, side: 'right', scale: 1.0, tilt: 34 },
  { threshold: 0.7, side: 'left', scale: 1.06, tilt: -36 },
  { threshold: 0.76, side: 'right', scale: 0.94, tilt: 26 },
  { threshold: 0.82, side: 'left', scale: 1.0, tilt: -32 },
  { threshold: 0.88, side: 'right', scale: 0.9, tilt: 30 },
  { threshold: 0.94, side: 'left', scale: 0.82, tilt: -25 },
];

/**
 * Renders a single botanical English-ivy branch along the paper margin that grows
 * downward and unfurls leaves smoothly in sync with page scroll progress.
 */
export function ScrollIvyBranch({ containerRef, className }: ScrollIvyBranchProps) {
  const stemPathRef = useRef<SVGPathElement>(null);
  const [stemLength, setStemLength] = useState(1100);
  const [leaves, setLeaves] = useState<LeafNode[]>([]);
  const [progress, setProgress] = useState(0.06);

  // Measure the SVG stem curve and sample exact attachment coordinates for each leaf.
  useEffect(() => {
    const pathEl = stemPathRef.current;
    if (!pathEl || typeof pathEl.getTotalLength !== 'function') {
      return;
    }

    const total = pathEl.getTotalLength();
    setStemLength(total);

    const computedLeaves: LeafNode[] = LEAF_STATIONS.map((station, index) => {
      const point = pathEl.getPointAtLength(station.threshold * total);
      return {
        id: index,
        threshold: station.threshold,
        xPct: (point.x / 80) * 100,
        yPct: (point.y / 1000) * 100,
        side: station.side,
        scale: station.scale,
        angle: station.tilt,
        tone: LEAF_TONES[index % LEAF_TONES.length] ?? '#2f3e24',
      };
    });

    setLeaves(computedLeaves);
  }, []);

  // Track scroll progress smoothly via requestAnimationFrame.
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setProgress(1);
      return;
    }

    let rafId = 0;

    const updateProgress = () => {
      rafId = 0;
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportLead = window.innerHeight * 0.65;
      const raw = (viewportLead - rect.top) / Math.max(rect.height, 1);
      const clamped = Math.min(1, Math.max(0.06, raw));
      setProgress(clamped);
    };

    const scheduleUpdate = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [containerRef]);

  const dashOffset = stemLength * (1 - progress);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none select-none absolute top-4 bottom-6 left-0 z-10 hidden md:block w-10 lg:w-12 xl:w-16',
        className,
      )}
    >
      {/* Continuous non-distorted vine stem */}
      <svg
        viewBox="0 0 80 1000"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        {/* Soft faint guide trail so upper edge looks rooted */}
        <path
          d={VINE_PATH_D}
          fill="none"
          stroke="#2f3e24"
          strokeOpacity="0.08"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />

        {/* Animated growing vine stem */}
        <path
          ref={stemPathRef}
          d={VINE_PATH_D}
          fill="none"
          stroke="#2f3e24"
          strokeOpacity="0.8"
          strokeWidth="2.4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={stemLength}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 90ms linear' }}
        />
      </svg>

      {/* Undistorted English ivy leaves blooming along exact stem coordinates */}
      {leaves.map((leaf) => {
        const isVisible = progress >= leaf.threshold;
        const isLeft = leaf.side === 'left';
        const flipX = isLeft ? -1 : 1;

        return (
          <div
            key={leaf.id}
            style={{
              top: `${leaf.yPct}%`,
              ...(isLeft
                ? { right: `calc(100% - ${leaf.xPct}% - 2px)` }
                : { left: `calc(${leaf.xPct}% - 2px)` }),
              transform: `translateY(-50%) scale(${isVisible ? leaf.scale : 0.2}) rotate(${
                isVisible ? leaf.angle : 0
              }deg)`,
              opacity: isVisible ? 0.9 : 0,
            }}
            className={cn(
              'absolute transition-all duration-500 ease-out will-change-transform',
              isLeft ? 'origin-right' : 'origin-left',
            )}
          >
            <svg
              viewBox="0 0 36 36"
              className="size-5 lg:size-6 xl:size-7 drop-shadow-[0_2px_3px_rgba(24,35,16,0.16)]"
              style={{ transform: `scaleX(${flipX})` }}
            >
              {/* Petiole (stem connector) */}
              <path
                d="M 2 18 Q 7 18 10 17"
                fill="none"
                stroke="#2f3e24"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* 3-lobed English ivy leaf silhouette */}
              <path
                d="M 10 17 C 11 9, 17 6, 21 10 C 23 6, 29 9, 34 15 C 29 19, 28 24, 24 27 C 21 24, 17 29, 13 26 C 10 23, 9 20, 10 17 Z"
                fill={leaf.tone}
              />
              {/* Delicate cream-tinted leaf veins */}
              <path
                d="M 11 17 L 28 16 M 17 17 L 20 11 M 19 17 L 23 23"
                fill="none"
                stroke="#f8f4e2"
                strokeOpacity="0.45"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
