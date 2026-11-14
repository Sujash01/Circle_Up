import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ScrollIvyBranch } from '../src/components/landing/ScrollIvyBranch';

describe('ScrollIvyBranch', () => {
  it('draws the stem with dash offset and reveals leaves with scroll progress', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const containerRef = createRef<HTMLElement>();
    const mainEl = document.createElement('main');
    document.body.appendChild(mainEl);
    (containerRef as { current: HTMLElement | null }).current = mainEl;

    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    let frameTime = 0;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrameId;
      callbacks.set(id, callback);
      return id;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id);
    });
    const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const totalLengthDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getTotalLength');
    const pointDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getPointAtLength');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
      configurable: true,
      value: () => 2000,
    });
    Object.defineProperty(SVGElement.prototype, 'getPointAtLength', {
      configurable: true,
      value: (distance: number) => ({ x: 52 + Math.sin(distance / 80) * 20, y: distance }),
    });
    mainEl.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 0,
        right: 112,
        bottom: 2100,
        width: 112,
        height: 2000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const root = createRoot(host);
    act(() => {
      root.render(<ScrollIvyBranch containerRef={containerRef} />);
    });

    const flushFrame = () => {
      const queued = Array.from(callbacks.values());
      callbacks.clear();
      queued.forEach((callback) => {
        frameTime += 16;
        callback(frameTime);
      });
    };

    try {
      act(() => flushFrame());
      act(() => {
        for (let frame = 0; frame < 60 && callbacks.size > 0; frame += 1) flushFrame();
      });

      const vineWrapper = host.querySelector('[aria-hidden="true"]');
      const stem = host.querySelector<SVGPathElement>('[data-vine-stem]');
      const tip = host.querySelector<SVGGElement>('[data-vine-tip]');
      expect(vineWrapper).not.toBeNull();
      expect(vineWrapper?.getAttribute('aria-hidden')).toBe('true');
      expect(vineWrapper?.querySelectorAll('path').length).toBeGreaterThan(5);
      expect(vineWrapper?.querySelector('linearGradient')).not.toBeNull();
      expect(vineWrapper?.querySelectorAll('[data-vine-flower]').length).toBeGreaterThan(0);
      expect(vineWrapper?.querySelector('svg')?.getAttribute('preserveAspectRatio')).not.toBe('none');
      const pathData = stem?.getAttribute('d') ?? '';
      expect(pathData.match(/M /g)).toHaveLength(1);
      expect(pathData).toMatch(/^M -\d/);
      expect(pathData.match(/C /g)?.length).toBeGreaterThan(6);
      type Pt = { x: number; y: number };
      const curves = pathData.split(' C ').slice(1);
      const parseCurve = (curve: string) => {
        const [c1x = 0, c1y = 0, c2x = 0, c2y = 0, x = 0, y = 0] = (
          curve.match(/-?\d+(?:\.\d+)?/g) ?? []
        ).map(Number);
        return { c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, end: { x, y } };
      };
      const parsed = curves.map(parseCurve);
      const startMatch = pathData.match(/^M (-?[\d.]+) (-?[\d.]+)/);
      expect(startMatch).not.toBeNull();
      const start: Pt = { x: Number(startMatch?.[1]), y: Number(startMatch?.[2]) };
      const entry = parsed[0]!;
      const loopArcs = parsed.slice(1, 9);
      const transition = parsed[9]!;
      const stemCurves = parsed.slice(10);
      expect(loopArcs).toHaveLength(8);
      expect(stemCurves.length).toBeGreaterThan(3);
      expect(pathData).not.toContain(' L ');

      const loopEntry = entry.end;
      const rightArc = loopArcs[3]!.end;
      const topArc = loopArcs[5]!.end;
      const loopExit = loopArcs[7]!.end;
      const stemOrigin = transition.end;

      // Every join is tangent-continuous: no kinks at the loop or the stem.
      const smoothJoin = (before: Pt, joint: Pt, after: Pt) => {
        const a = { x: joint.x - before.x, y: joint.y - before.y };
        const b = { x: after.x - joint.x, y: after.y - joint.y };
        const cross = (a.x * b.y - a.y * b.x) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
        return Math.abs(cross) < 0.01 && a.x * b.x + a.y * b.y > 0;
      };
      expect(smoothJoin(entry.c2, loopEntry, loopArcs[0]!.c1)).toBe(true);
      expect(smoothJoin(loopArcs[7]!.c2, loopExit, transition.c1)).toBe(true);
      expect(smoothJoin(transition.c2, stemOrigin, stemCurves[0]!.c1)).toBe(true);

      // Open curl: enters at the bottom, sweeps right, over the top, and leaves
      // from the upper-left; the stem then drops below the loop.
      expect(rightArc.x).toBeGreaterThan(loopEntry.x);
      expect(rightArc.x).toBeGreaterThan(loopExit.x);
      expect(topArc.y).toBeLessThan(rightArc.y);
      expect(topArc.y).toBeLessThan(loopEntry.y);
      expect(loopExit.x).toBeLessThan(loopEntry.x);
      expect(loopExit.y).toBeLessThan(loopEntry.y);
      expect(stemOrigin.y).toBeGreaterThan(loopEntry.y);
      expect(stemOrigin.x).toBeLessThan(loopExit.x);

      // The loop is big and round (like the reference), not a small squashed ring.
      const loopXs = loopArcs.map((arc) => arc.end.x);
      const loopYs = loopArcs.map((arc) => arc.end.y);
      const loopWidth = Math.max(...loopXs) - Math.min(...loopXs);
      const loopHeight = Math.max(...loopYs) - Math.min(...loopYs);
      expect(loopWidth).toBeGreaterThan(112 * 0.6);
      expect(loopWidth).toBeLessThan(112 * 0.9);
      expect(loopHeight / loopWidth).toBeGreaterThan(0.85);
      expect(loopHeight / loopWidth).toBeLessThan(1.1);

      // The incoming vine must CROSS the stem exactly once, just below the loop exit.
      const bezier = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
        const u = 1 - t;
        return {
          x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
          y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
        };
      };
      const stemPointAtY = (y: number): Pt => {
        let low = 0;
        let high = 1;
        for (let i = 0; i < 40; i += 1) {
          const middle = (low + high) / 2;
          if (bezier(loopExit, transition.c1, transition.c2, stemOrigin, middle).y < y) low = middle;
          else high = middle;
        }
        return bezier(loopExit, transition.c1, transition.c2, stemOrigin, low);
      };
      let crossings = 0;
      let crossingY = 0;
      let previousSide = 0;
      for (let i = 0; i <= 400; i += 1) {
        const point = bezier(start, entry.c1, entry.c2, entry.end, i / 400);
        if (point.y >= loopExit.y && point.y <= stemOrigin.y) {
          const side = Math.sign(point.x - stemPointAtY(point.y).x);
          if (previousSide !== 0 && side !== previousSide) {
            crossings += 1;
            crossingY = point.y;
          }
          previousSide = side;
        }
      }
      expect(crossings).toBe(1);
      expect(crossingY).toBeGreaterThan(loopExit.y + 8);
      expect(crossingY).toBeLessThan(loopEntry.y);

      // The stem sways wide and back repeatedly and stays inside the gutter.
      const stemXs = stemCurves.map((curve) => curve.end.x);
      expect(Math.max(...stemXs) - Math.min(...stemXs)).toBeGreaterThan(112 * 0.35);
      expect(Math.min(...stemXs)).toBeGreaterThan(-2);
      expect(Math.max(...stemXs)).toBeLessThan(112);
      let directionChanges = 0;
      for (let i = 2; i < stemXs.length; i += 1) {
        if (Math.sign(stemXs[i]! - stemXs[i - 1]!) !== Math.sign(stemXs[i - 1]! - stemXs[i - 2]!)) {
          directionChanges += 1;
        }
      }
      expect(directionChanges).toBeGreaterThanOrEqual(4);

      const initialDashOffset = Number(stem?.style.strokeDashoffset);
      const initialTipTransform = tip?.getAttribute('transform');
      const countVisibleLeaves = () =>
        Array.from(host.querySelectorAll<SVGGElement>('[data-vine-leaf]')).filter(
          (leaf) => Number(leaf.style.opacity) > 0,
        ).length;
      const initialVisibleLeaves = countVisibleLeaves();

      Object.defineProperty(window, 'scrollY', { configurable: true, value: 1 });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        for (let frame = 0; frame < 60 && callbacks.size > 0; frame += 1) flushFrame();
      });

      expect(Number(stem?.style.strokeDashoffset)).toBeLessThan(initialDashOffset);
      const firstPixelDashOffset = Number(stem?.style.strokeDashoffset);

      Object.defineProperty(window, 'scrollY', { configurable: true, value: 50 });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        for (let frame = 0; frame < 60 && callbacks.size > 0; frame += 1) flushFrame();
      });
      expect(Number(stem?.style.strokeDashoffset)).toBeLessThan(firstPixelDashOffset);

      Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        for (let frame = 0; frame < 60 && callbacks.size > 0; frame += 1) flushFrame();
      });

      expect(Number(stem?.style.strokeDashoffset)).toBeLessThan(initialDashOffset);
      expect(tip?.getAttribute('transform')).not.toBe(initialTipTransform);
      expect(countVisibleLeaves()).toBeGreaterThan(initialVisibleLeaves);

      const countVisibleFlowers = () =>
        Array.from(host.querySelectorAll<SVGGElement>('[data-vine-flower]')).filter(
          (flower) => Number(flower.style.opacity) > 0,
        ).length;
      const initialVisibleFlowers = countVisibleFlowers();
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 1800 });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        for (let frame = 0; frame < 60 && callbacks.size > 0; frame += 1) flushFrame();
      });
      expect(countVisibleFlowers()).toBeGreaterThan(initialVisibleFlowers);
    } finally {
      act(() => root.unmount());
      host.remove();
      mainEl.remove();
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      if (scrollDescriptor) Object.defineProperty(window, 'scrollY', scrollDescriptor);
      if (viewportDescriptor) Object.defineProperty(window, 'innerHeight', viewportDescriptor);
      if (totalLengthDescriptor) {
        Object.defineProperty(SVGElement.prototype, 'getTotalLength', totalLengthDescriptor);
      } else {
        Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength');
      }
      if (pointDescriptor) {
        Object.defineProperty(SVGElement.prototype, 'getPointAtLength', pointDescriptor);
      } else {
        Reflect.deleteProperty(SVGElement.prototype, 'getPointAtLength');
      }
    }
  });
});

