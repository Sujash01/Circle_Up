import { readStorage, writeStorage } from './storage';

const WISHLIST_STORAGE_KEY = 'circleup_wishlist_v1';

export const wishlistService = {
  loadIds(): string[] {
    const stored = readStorage<string[]>(WISHLIST_STORAGE_KEY, []);
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  },

  saveIds(ids: string[]): string[] {
    const unique = Array.from(new Set(ids));
    writeStorage(WISHLIST_STORAGE_KEY, unique);
    return unique;
  },

  toggleId(currentIds: string[], productId: string): string[] {
    const exists = currentIds.includes(productId);
    const next = exists
      ? currentIds.filter((id) => id !== productId)
      : [productId, ...currentIds];
    return this.saveIds(next);
  },

  removeId(currentIds: string[], productId: string): string[] {
    return this.saveIds(currentIds.filter((id) => id !== productId));
  },
};

