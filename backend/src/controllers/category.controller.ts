import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';
import { Product } from '../models/Product.js';
import { SEED_PRODUCTS } from '../data/seedProducts.js';
import mongoose from 'mongoose';

const DEFAULT_CATEGORIES = [
  { slug: 'womens-one-piece', name: "Women's One Piece", subcategories: ['Co-ords', 'Dresses', 'Jumpsuits'] },
  { slug: 'womens-upperwear', name: "Women's Upperwear", subcategories: ['Corsets', 'Tops', 'Knits', 'Blouses'] },
  { slug: 'womens-bottomwear', name: "Women's Bottomwear", subcategories: ['Skirts', 'Trousers', 'Denim'] },
  { slug: 'mens-upperwear', name: "Men's Upperwear (Unisex)", subcategories: ['Varsity', 'Sweatshirts', 'Shirts'] },
  { slug: 'mens-bottomwear', name: "Men's Bottomwear (Unisex)", subcategories: ['Cargo', 'Pants', 'Denim'] },
  { slug: 'accessories', name: 'Accessories', subcategories: ['Handbags', 'Slings', 'Scarves', 'Belts'] },
  { slug: 'rentals', name: 'Rentals', subcategories: ['Occasion Co-ords', 'Statement Blazers'] },
  { slug: 'thrifted-treasure', name: 'Thrifted Treasure', subcategories: ['1-of-1 Archival'] },
  { slug: 'handcrafted', name: 'Handcrafted', subcategories: ['Artisan Knits', 'Bags'] },
  { slug: 'ethnic-wear', name: 'Ethnic Wear', subcategories: ['Kurtas', 'Dupattas'] },
];

export const categoryController = {
  async listCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      const isDbConnected = mongoose.connection.readyState === 1;
      let categoriesWithCounts = DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        itemCount: 0,
      }));

      if (isDbConnected) {
        const counts = await Product.aggregate([
          { $match: { status: { $in: ['ACTIVE', 'PUBLISHED'] }, deletedAt: null } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(counts.map((c) => [c._id, c.count]));
        categoriesWithCounts = categoriesWithCounts.map((c) => ({
          ...c,
          itemCount: countMap.get(c.slug) || 0,
        }));
      } else {
        categoriesWithCounts = categoriesWithCounts.map((c) => ({
          ...c,
          itemCount: SEED_PRODUCTS.filter((p) => p.category === c.slug).length,
        }));
      }

      return sendSuccess(res, categoriesWithCounts);
    } catch (error) {
      next(error);
    }
  },

  async listCollections(_req: Request, res: Response, next: NextFunction) {
    try {
      const collections = [
        {
          id: 'col-rtw',
          slug: 'ready-to-wear',
          title: 'Ready-To-Wear',
          blurb: 'Co-ords, one-pieces and everyday tops, each one thrifted, checked and ready for a second life.',
          categorySlug: 'womens-one-piece',
        },
        {
          id: 'col-bags',
          slug: 'handbags',
          title: 'Handbags Collection',
          blurb: 'Structured satchels, slings and handhelds with plenty of life left in them.',
          categorySlug: 'accessories',
        },
        {
          id: 'col-winter',
          slug: 'winter-collection',
          title: 'Winter Collection',
          blurb: 'Layered knits, cardigan coats and varsity finds for the cold months.',
          categorySlug: 'thrifted-treasure',
        },
      ];
      return sendSuccess(res, collections);
    } catch (error) {
      next(error);
    }
  },
};
