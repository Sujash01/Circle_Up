import { Product } from '../models/Product.js';
import { SEED_PRODUCTS } from '../data/seedProducts.js';
import { BadRequestError } from '../errors/AppError.js';
import mongoose from 'mongoose';
import { isSupabaseConfigured } from './supabase.service.js';
import { supabaseCatalogService } from './supabaseCatalog.service.js';

export interface SearchMatch {
  id: string;
  name: string;
  slug: string;
  category: string;
  categoryLabel?: string;
  price: number;
  thumbnail: string;
  score: number;
}

export const searchService = {
  async searchCatalog(
    rawQuery: string,
    limit = 12,
    page = 1,
    isSuggestions = false,
  ): Promise<{ results: SearchMatch[]; total: number; page: number; limit: number }> {
    const q = (rawQuery || '').trim();
    if (q.length < 2) {
      if (isSuggestions) return { results: [], total: 0, page: 1, limit };
      throw new BadRequestError('Search query must be at least 2 characters long.', 'QUERY_TOO_SHORT');
    }

    const cleanQ = q.toLowerCase();
    const isDbConnected = mongoose.connection.readyState === 1;

    let items: Array<{
      id?: string;
      _id?: unknown;
      name: string;
      slug: string;
      category: string;
      categoryLabel?: string;
      price: number;
      images: string[];
      tags: string[];
      subcategory?: string;
    }> = [];

    if (isSupabaseConfigured()) {
      items = await supabaseCatalogService.searchCatalogItems();
    } else if (isDbConnected) {
      const docs = await Product.find({
        status: { $in: ['ACTIVE', 'PUBLISHED'] },
        deletedAt: null,
      }).lean();
      items = docs as unknown as typeof items;
    } else {
      items = (SEED_PRODUCTS as unknown as typeof items).filter((p) => (p as Record<string, unknown>).status !== 'DRAFT');
    }

    // Rank algorithm: name prefix (100) > name contains (50) > tags/category match (25)
    const scored: SearchMatch[] = [];

    for (const item of items) {
      const nameLower = (item.name || '').toLowerCase();
      const catLower = (item.category || '').toLowerCase();
      const subLower = (item.subcategory || '').toLowerCase();
      const tags = (item.tags || []).map((t) => t.toLowerCase());

      let score = 0;

      if (nameLower.startsWith(cleanQ)) {
        score += 100;
      } else if (nameLower.includes(cleanQ)) {
        score += 50;
      }

      if (catLower.includes(cleanQ) || subLower.includes(cleanQ)) {
        score += 30;
      }

      if (tags.some((t) => t.includes(cleanQ))) {
        score += 20;
      }

      if (score > 0) {
        scored.push({
          id: String(item.id || item._id || item.slug),
          name: item.name,
          slug: item.slug,
          category: item.category,
          categoryLabel: item.categoryLabel || item.category,
          price: item.price,
          thumbnail: item.images?.[0] || '',
          score,
        });
      }
    }

    // Sort by score descending, then alphabetical
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const total = scored.length;
    const effectiveLimit = isSuggestions ? Math.min(limit, 6) : Math.min(limit, 48);
    const skip = (page - 1) * effectiveLimit;
    const results = scored.slice(skip, skip + effectiveLimit);

    return {
      results,
      total,
      page,
      limit: effectiveLimit,
    };
  },
};
