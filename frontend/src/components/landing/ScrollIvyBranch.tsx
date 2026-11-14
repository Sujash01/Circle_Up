import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { subscribeToScrollFrames } from '@/lib/scrollScheduler';
import { createIvyLeafVariation, IvyLeafArtwork, type IvyLeafKind } from './chest/ivy';

interface ScrollIvyBranchProps {
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
}

type Point = { x: number; y: number };
type PathSample = { pageY: number; distance: number };

interface LeafSpec extends Point {
  id: number;
  t: number;
  kind: IvyLeafKind;
  side: -1 | 1;
  scale: number;
  angle: number;
  tone: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getLengthAtPageY(samples: PathSample[], pageY: number): number {
  if (samples.length === 0 || pageY <= samples[0]!.pageY) return samples[0]?.distance ?? 0;
  const last = samples[samples.length - 1]!;
  if (pageY >= last.pageY) return last.distance;

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle]!.pageY <= pageY) low = middle;
    else high = middle;
  }

  const start = samples[low]!;
  const end = samples[high]!;
  const ratio = (pageY - start.pageY) / (end.pageY - start.pageY || 1);
  return start.distance + (end.distance - start.distance) * ratio;
}

function createVinePath(width: number, height: number): string {
  const compact = width < 70;
  // Big, round loop (about 0.8 of the gutter wide) sitting just right of the stem.
  const radiusX = Math.min(width * 0.39, compact ? 19 : 46);
  const radiusY = radiusX * 0.93;
  const centerX = width * 0.46;
  const centerY = radiusY + 12;
  // The vine joins the loop at the bottom and leaves from the upper-left.
  const startAngle = Math.PI * 0.55;
  const endAngle = -Math.PI * 0.75;
  const arcSegments = 8;
  const eggBias = 0.08;
  const angleStep = (endAngle - startAngle) / arcSegments;
  const arcHandle = (4 / 3) * Math.tan(angleStep / 4);
  const ellipsePoint = (angle: number): Point => ({
    x: centerX + radiusX * Math.cos(angle),
    y: centerY + radiusY * (Math.sin(angle) + eggBias * Math.sin(angle) ** 2),
  });
  const ellipseDerivative = (angle: number): Point => ({
    x: -radiusX * Math.sin(angle),
    y: radiusY * (Math.cos(angle) + 2 * eggBias * Math.sin(angle) * Math.cos(angle)),
  });
  // Unit direction of travel around the loop (the angle decreases as we draw).
  const heading = (angle: number): Point => {
    const derivative = ellipseDerivative(angle);
    const length = Math.hypot(derivative.x, derivative.y) || 1;
    return { x: -derivative.x / length, y: -derivative.y / length };
  };
  const entryPoint = ellipsePoint(startAngle);
  const startX = -Math.max(14, width * 0.24);
  const startY = centerY - radiusY * 0.1;
  const exitPoint = ellipsePoint(endAngle);
  // The stem starts below and slightly left of the loop exit, so the incoming
  // vine crosses it on the way to the bottom of the loop.
  const stemOrigin = { x: centerX - radiusX, y: centerY + radiusY * 1.45 };
  const hookDepth = Math.min(height, stemOrigin.y);
  const remainingHeight = Math.max(1, height - hookDepth);

  // Stem: a long, lazy S-curve. `lift` raises the later troughs so the vine
  // drifts into the gutter instead of returning to the left edge every swing.
  const wavelength = compact ? 400 : 420;
  const swing = width * (compact ? 0.38 : 0.33);
  const lift = width * 0.15;
  const spacing = compact ? 48 : 56;
  const steps = Math.max(6, Math.ceil(remainingHeight / spacing));
  const points: Point[] = [stemOrigin];
  for (let i = 1; i <= steps; i++) {
    const distance = (i / steps) * remainingHeight;
    const phase = (distance / wavelength) * Math.PI * 2;
    const drift = 1 + 0.16 * Math.sin(phase * 0.43 + 0.8);
    points.push({
      x:
        stemOrigin.x +
        (swing * drift * (1 - Math.cos(phase))) / 2 +
        lift * (1 - Math.exp(-distance / 200)),
      y: hookDepth + distance,
    });
  }

  const first = points[0]!;
  const second = points[1]!;

  // Entry: long, gentle approach from the left; its end handle follows the loop tangent.
  const entryHeading = heading(startAngle);
  const entryReach = 0.38 * Math.hypot(entryPoint.x - startX, entryPoint.y - startY);
  let path =
    `M ${startX.toFixed(2)} ${startY.toFixed(2)}` +
    ` C ${(startX + width * 0.42).toFixed(2)} ${(startY + radiusY * 0.12).toFixed(2)}, ${(entryPoint.x - entryHeading.x * entryReach).toFixed(2)} ${(entryPoint.y - entryHeading.y * entryReach).toFixed(2)}, ${entryPoint.x.toFixed(2)} ${entryPoint.y.toFixed(2)}`;

  // Loop: 8 cubic arcs.
  for (let i = 0; i < arcSegments; i++) {
    const angle0 = startAngle + angleStep * i;
    const angle1 = angle0 + angleStep;
    const point0 = ellipsePoint(angle0);
    const point1 = ellipsePoint(angle1);
    const derivative0 = ellipseDerivative(angle0);
    const derivative1 = ellipseDerivative(angle1);
    const control1 = {
      x: point0.x + arcHandle * derivative0.x,
      y: point0.y + arcHandle * derivative0.y,
    };
    const control2 = {
      x: point1.x - arcHandle * derivative1.x,
      y: point1.y - arcHandle * derivative1.y,
    };
    path += ` C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)}, ${control2.x.toFixed(2)} ${control2.y.toFixed(2)}, ${point1.x.toFixed(2)} ${point1.y.toFixed(2)}`;
  }

  // Transition: from the loop exit (heading down-left) into the stem, with
  // long handles so there is no kink where they meet.
  const exitHeading = heading(endAngle);
  const stemDx = second.x - first.x;
  const stemDy = second.y - first.y;
  const stemLength = Math.hypot(stemDx, stemDy) || 1;
  const exitReach = 0.4 * Math.hypot(first.x - exitPoint.x, first.y - exitPoint.y);
  path += ` C ${(exitPoint.x + exitHeading.x * exitReach).toFixed(2)} ${(exitPoint.y + exitHeading.y * exitReach).toFixed(2)}, ${(first.x - (stemDx / stemLength) * exitReach).toFixed(2)} ${(first.y - (stemDy / stemLength) * exitReach).toFixed(2)}, ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  // Stem: Catmull-Rom style smoothing through the sway points.
  points.slice(0, -1).forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[index + 1]!;
    const after = points[Math.min(points.length - 1, index + 2)]!;
    const cp1x = point.x + (next.x - previous.x) / 6;
    const cp1y = point.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - point.x) / 6;
    const cp2y = next.y - (after.y - point.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  });
  return path;
}

export function ScrollIvyBranch({ containerRef, className }: ScrollIvyBranchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measurePathRef = useRef<SVGPathElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  const stemHighlightRef = useRef<SVGPathElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const leafRefs = useRef<Array<SVGGElement | null>>([]);
  const flowerRefs = useRef<Array<SVGGElement | null>>([]);
  const metricsRef = useRef({
    docTop: 0,
    height: 1,
    totalLength: 0,
    points: [] as Point[],
    pageYLengths: [] as PathSample[],
    leafGrows: [] as number[],
    progress: 0,
  });
  const [size, setSize] = useState({ width: 112, height: 1600 });
  const [leaves, setLeaves] = useState<LeafSpec[]>([]);
  const pathData = useMemo(() => createVinePath(size.width, size.height), [size]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;

    let disposed = false;
    const updatePageYLookup = () => {
      const metrics = metricsRef.current;
      const sampleCount = metrics.points.length - 1;
      metrics.pageYLengths = metrics.points.map((point, index) => ({
        pageY: metrics.docTop + point.y,
        distance: sampleCount > 0 ? (index / sampleCount) * metrics.totalLength : 0,
      }));
    };
    const measure = () => {
      const anchor = container.querySelector<HTMLElement>('#ready-to-wear');
      if (anchor) {
        wrapper.style.top = `${anchor.offsetTop}px`;
        wrapper.style.bottom = '0px';
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const containerRect = (anchor ?? container).getBoundingClientRect();
      const width = Math.max(44, Math.round(wrapperRect.width || size.width));
      const height = Math.max(1, Math.round(anchor ? wrapperRect.height : containerRect.height) || size.height);
      metricsRef.current.docTop = containerRect.top + window.scrollY;
      metricsRef.current.height = height;
      updatePageYLookup();
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(wrapper);
    observer?.observe(container);
    container.addEventListener('load', measure, true);
    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', measure);
    void fonts?.ready.then(() => {
      if (!disposed) measure();
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      container.removeEventListener('load', measure, true);
      fonts?.removeEventListener('loadingdone', measure);
    };
  }, [containerRef, size.height, size.width]);

  useLayoutEffect(() => {
    const path = measurePathRef.current;
    const stem = stemRef.current;
    const highlight = stemHighlightRef.current;
    if (!path || typeof path.getTotalLength !== 'function') return;

    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) return;

    metricsRef.current.totalLength = totalLength;
    [stem, highlight].forEach((visiblePath) => {
      if (!visiblePath) return;
      visiblePath.style.strokeDasharray = `${totalLength}`;
      visiblePath.style.strokeDashoffset = `${totalLength}`;
    });
    const sampleCount = Math.min(800, Math.max(240, Math.ceil(size.height / 12)));
    metricsRef.current.points = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const point = path.getPointAtLength((index / sampleCount) * totalLength);
      return { x: point.x, y: point.y };
    });
    metricsRef.current.pageYLengths = metricsRef.current.points.map((point, index) => ({
      pageY: metricsRef.current.docTop + point.y,
      distance: (index / sampleCount) * totalLength,
    }));

    const count = Math.max(8, Math.min(34, Math.floor(size.height / (size.width < 70 ? 260 : 190))));
    const nextLeaves = Array.from({ length: count }, (_, index) => {
      const variation = createIvyLeafVariation(4817, index);
      const t = 0.035 + ((index + 0.35 + variation.spacingJitter * 0.3) / count) * 0.93;
      const distance = t * totalLength;
      const point = path.getPointAtLength(distance);
      const before = path.getPointAtLength(Math.max(0, distance - 5));
      const after = path.getPointAtLength(Math.min(totalLength, distance + 5));
      const tangent = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
      return {
        id: index,
        t,
        x: point.x,
        y: point.y,
        side: variation.side,
        kind: variation.kind,
        scale: variation.scale * (size.width < 70 ? 0.72 : 1),
        angle: tangent - 90 + variation.side * variation.angleOffset,
        tone: variation.tone,
      } satisfies LeafSpec;
    });
    metricsRef.current.leafGrows = new Array(nextLeaves.length).fill(-1);
    setLeaves(nextLeaves);
  }, [pathData, size.height, size.width]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery?.matches ?? false;

    const applyProgress = (progress: number) => {
      const metrics = metricsRef.current;
      const dashOffset = metrics.totalLength * (1 - progress);
      [stemRef.current, stemHighlightRef.current].forEach((stem) => {
        if (stem) stem.style.strokeDashoffset = dashOffset.toFixed(2);
      });

      const tip = tipRef.current;
      if (tip && metrics.totalLength > 0) {
        const pointIndex = progress * (metrics.points.length - 1);
        const lowerIndex = Math.floor(pointIndex);
        const upperIndex = Math.min(metrics.points.length - 1, lowerIndex + 1);
        const lower = metrics.points[lowerIndex];
        const upper = metrics.points[upperIndex];
        if (lower && upper) {
          const pointProgress = pointIndex - lowerIndex;
          const x = lower.x + (upper.x - lower.x) * pointProgress;
          const y = lower.y + (upper.y - lower.y) * pointProgress;
          tip.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
          tip.style.opacity = progress > 0 && progress < 0.999 ? '1' : '0';
        }
      }

      leaves.forEach((leaf, index) => {
        const group = leafRefs.current[index];
        if (!group) return;
        const grow = clamp((progress - (leaf.t - 0.018)) / 0.055, 0, 1);
        const previous = metrics.leafGrows[index] ?? -1;
        if (Math.abs(grow - previous) < 0.004) return;
        metrics.leafGrows[index] = grow;
        const eased = 1 - (1 - grow) * (1 - grow);
        group.style.opacity = grow <= 0.01 ? '0' : `${eased.toFixed(2)}`;
        group.setAttribute(
          'transform',
          `translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${(leaf.angle * eased).toFixed(1)}) scale(${(leaf.side * leaf.scale * eased).toFixed(3)} ${(leaf.scale * eased).toFixed(3)})`,
        );
      });

      const flowers = leaves.filter((_, index) => index % 5 === 2);
      flowers.forEach((flower, index) => {
        const group = flowerRefs.current[index];
        if (!group) return;
        const bloom = clamp((progress - (flower.t - 0.012)) / 0.025, 0, 1);
        const eased = 1 - (1 - bloom) * (1 - bloom);
        group.style.opacity = eased.toFixed(2);
        group.setAttribute(
          'transform',
          `translate(${(flower.x + flower.side * 13).toFixed(1)} ${(flower.y - 4).toFixed(1)}) rotate(${(flower.angle * 0.18).toFixed(1)}) scale(${eased.toFixed(3)})`,
        );
      });
    };

    // Let the vine reach most of the first screen on load, then keep its tip
    // tracking just below the reader as they move down the journal.
    const openingPageY = window.scrollY + window.innerHeight * 0.8;
    metricsRef.current.progress = metricsRef.current.totalLength > 0
      ? getLengthAtPageY(metricsRef.current.pageYLengths, openingPageY) / metricsRef.current.totalLength
      : 0;
    applyProgress(metricsRef.current.progress);

    const targets = container.querySelectorAll('#ready-to-wear, section:not(#hero), footer');
    const visibleTargets = new Set<Element>();
    let unsubscribe: (() => void) | null = null;
    let lastFrameTime = 0;
    const start = () => {
      if (unsubscribe || reducedMotion) return;
      unsubscribe = subscribeToScrollFrames((scrollY, _now, viewportHeight) => {
        const metrics = metricsRef.current;
        const tipPageY = scrollY + viewportHeight * 0.8;
        const targetLength = getLengthAtPageY(metrics.pageYLengths, tipPageY);
        const targetProgress = metrics.totalLength > 0 ? targetLength / metrics.totalLength : 0;
        const elapsed = lastFrameTime === 0 ? 16 : clamp(_now - lastFrameTime, 0, 80);
        const smoothing = 1 - Math.exp(-elapsed / 72);
        lastFrameTime = _now;
        metrics.progress += (targetProgress - metrics.progress) * smoothing;
        if (Math.abs(targetProgress - metrics.progress) < 0.0004) {
          metrics.progress = targetProgress;
        }
        applyProgress(metrics.progress);
        return Math.abs(targetProgress - metrics.progress) >= 0.0004;
      });
    };
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        stop();
        metricsRef.current.progress = 1;
        applyProgress(1);
      } else if (visibleTargets.size > 0) {
        start();
      }
    };
    motionQuery?.addEventListener?.('change', handleMotionChange);
    if (reducedMotion) {
      metricsRef.current.progress = 1;
      applyProgress(1);
    }

    if (typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) visibleTargets.add(entry.target);
            else visibleTargets.delete(entry.target);
          });
          if (visibleTargets.size > 0) start();
          else stop();
        },
        { rootMargin: '120px 0px' },
      );
      targets.forEach((target) => observer.observe(target));
      if (targets.length === 0) observer.observe(container);
      return () => {
        observer.disconnect();
        stop();
        motionQuery?.removeEventListener?.('change', handleMotionChange);
      };
    }

    return () => {
      stop();
      motionQuery?.removeEventListener?.('change', handleMotionChange);
    };
  }, [containerRef, leaves]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={cn('home-vine-layer pointer-events-none absolute inset-y-0 z-10 select-none', className)}
    >
      <svg viewBox={`0 0 ${size.width} ${size.height}`} className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="home-vine-stem" x1="0" y1="0" x2="0" y2={size.height} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--forest-deep)" />
            <stop offset="1" stopColor="var(--steel)" />
          </linearGradient>
        </defs>
        <path ref={measurePathRef} d={pathData} fill="none" stroke="transparent" />
        <path
          ref={stemRef}
          data-vine-stem
          d={pathData}
          fill="none"
          stroke="url(#home-vine-stem)"
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          ref={stemHighlightRef}
          d={pathData}
          fill="none"
          stroke="var(--background)"
          strokeOpacity=".24"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g ref={tipRef} data-vine-tip style={{ opacity: 0 }}>
          <circle r="3" fill="var(--steel)" />
          <path d="M0 0C-4 5-2 10 0 12C2 10 4 5 0 0Z" fill="var(--forest)" />
        </g>
        {leaves.map((leaf, index) => (
          <g
            key={leaf.id}
            ref={(element) => {
              leafRefs.current[index] = element;
            }}
            data-vine-leaf
            style={{ opacity: 0 }}
          >
            <IvyLeafArtwork kind={leaf.kind} tone={leaf.tone} />
          </g>
        ))}
        {leaves.filter((_, index) => index % 5 === 2).map((flower, index) => (
          <g
            key={`flower-${flower.id}`}
            ref={(element) => { flowerRefs.current[index] = element; }}
            data-vine-flower
            style={{ opacity: 0 }}
          >
            {Array.from({ length: 5 }, (_, petal) => (
              <ellipse key={petal} cx="0" cy="-5" rx="2.7" ry="5" fill="var(--card)" transform={`rotate(${petal * 72})`} />
            ))}
            <circle r="2.1" fill="var(--antique-gold)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
