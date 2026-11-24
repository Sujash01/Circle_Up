import { useEffect, useSyncExternalStore } from 'react';
import type { StorefrontSettings } from '@circleup/shared';
import { storefrontApi } from './storefrontApi';

const defaults: StorefrontSettings = {
  header: { text: 'Plastic-free sustainable packaging on every parcel', link: '/new-arrivals', isActive: true },
  exitOffer: null,
  automaticCodes: [],
  whatsappNumber: '',
};

let settings = defaults;
let expiresAt = 0;
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => settings;

function refreshSettings() {
  if (pending || Date.now() < expiresAt) return;
  pending = storefrontApi.getStorefrontSettings().then((result) => {
    settings = result;
  }).catch(() => {
    settings = defaults;
  }).finally(() => {
    expiresAt = Date.now() + 30_000;
    pending = undefined;
    for (const listener of listeners) listener();
  });
}

export function useStorefrontSettings(): StorefrontSettings {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    refreshSettings();
    const onFocus = () => refreshSettings();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return current;
}
