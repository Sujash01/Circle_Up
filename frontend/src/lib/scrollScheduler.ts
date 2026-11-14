type ScrollFrameHandler = (scrollY: number, now: number, viewportHeight: number) => boolean | void;

const subscribers = new Set<ScrollFrameHandler>();
let frameId = 0;
let listenersAttached = false;

function requestFrame() {
  if (frameId || document.hidden || subscribers.size === 0) return;
  frameId = window.requestAnimationFrame(runFrame);
}

function runFrame(now: number) {
  frameId = 0;
  if (document.hidden || subscribers.size === 0) return;

  const scrollY =
    typeof window !== 'undefined'
      ? (window.scrollY ??
         window.pageYOffset ??
         document.documentElement?.scrollTop ??
         document.scrollingElement?.scrollTop ??
         document.body?.scrollTop ??
         0)
      : 0;
  const viewportHeight =
    typeof window !== 'undefined'
      ? (window.innerHeight || document.documentElement?.clientHeight || 800)
      : 800;
  let needsAnotherFrame = false;
  subscribers.forEach((handler) => {
    if (handler(scrollY, now, viewportHeight) === true) needsAnotherFrame = true;
  });
  if (needsAnotherFrame) requestFrame();
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
  } else {
    requestFrame();
  }
}

function handleScroll() {
  requestFrame();
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function detachListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  window.removeEventListener('scroll', handleScroll);
  document.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleScroll);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = 0;
}

export function subscribeToScrollFrames(handler: ScrollFrameHandler): () => void {
  subscribers.add(handler);
  attachListeners();
  requestFrame();

  return () => {
    subscribers.delete(handler);
    if (subscribers.size === 0) detachListeners();
  };
}
