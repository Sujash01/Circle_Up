type RevealHandler = () => void;

const handlers = new Map<Element, RevealHandler>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (observer) return observer;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const handler = handlers.get(entry.target);
        if (!handler) return;
        handlers.delete(entry.target);
        observer?.unobserve(entry.target);
        handler();
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -32px 0px' },
  );
  return observer;
}

export function observeReveal(element: Element, handler: RevealHandler): () => void {
  const sharedObserver = getObserver();
  if (!sharedObserver) {
    handler();
    return () => {};
  }

  handlers.set(element, handler);
  sharedObserver.observe(element);
  return () => {
    handlers.delete(element);
    sharedObserver?.unobserve(element);
  };
}
