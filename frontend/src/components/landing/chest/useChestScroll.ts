import { useEffect, type RefObject } from 'react';
import { subscribeToScrollFrames } from '@/lib/scrollScheduler';
import { clamp } from './chestMath';

type FrameRenderer = (progress: number, now: number) => void;

export function useChestScroll(
  heroRef: RefObject<HTMLElement>,
  stageRef: RefObject<HTMLDivElement>,
  rendererRef: RefObject<FrameRenderer>,
) {
  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    if (!hero || !stage) return;

    let heroDocTop = 0;
    let heroTrack = 1;
    let navHeight = 76;
    let current = 0;
    let unsubscribe: (() => void) | null = null;
    let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const measure = () => {
      const heroRect = hero.getBoundingClientRect();
      const stageHeight = stage.getBoundingClientRect().height;
      const header = document.querySelector('header');
      navHeight = header?.getBoundingClientRect().height ?? 76;
      heroDocTop = heroRect.top + window.scrollY;
      heroTrack = Math.max(1, heroRect.height - stageHeight);
      current = clamp((window.scrollY - heroDocTop + navHeight) / heroTrack);
    };

    measure();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(hero);
    resizeObserver?.observe(stage);
    const header = document.querySelector('header');
    if (header) resizeObserver?.observe(header);

    const start = () => {
      if (unsubscribe || reducedMotion) return;
      hero.classList.add('tc-is-visible');
      unsubscribe = subscribeToScrollFrames((scrollY, now) => {
        const target = clamp((scrollY - heroDocTop + navHeight) / heroTrack);
        current += (target - current) * 0.14;
        if (Math.abs(target - current) < 0.0005) current = target;
        rendererRef.current?.(current, now);
        return true;
      });
    };
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
      hero.classList.remove('tc-is-visible');
    };
    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      stop();
      if (reducedMotion) rendererRef.current?.(1, 0);
      else if (isVisible) start();
    };
    let isVisible = false;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    motionQuery?.addEventListener?.('change', handleMotionChange);

    if (reducedMotion) {
      requestAnimationFrame(() => rendererRef.current?.(1, 0));
    } else if (typeof IntersectionObserver === 'undefined') {
      isVisible = true;
      start();
    } else {
      const observer = new IntersectionObserver(
        ([entry]) => {
          isVisible = Boolean(entry?.isIntersecting);
          if (isVisible) start();
          else stop();
        },
        { rootMargin: '120px 0px' },
      );
      observer.observe(hero);
      return () => {
        observer.disconnect();
        stop();
        resizeObserver?.disconnect();
        motionQuery?.removeEventListener?.('change', handleMotionChange);
      };
    }

    return () => {
      stop();
      resizeObserver?.disconnect();
      motionQuery?.removeEventListener?.('change', handleMotionChange);
    };
  }, [heroRef, rendererRef, stageRef]);
}
