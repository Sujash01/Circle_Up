import heroDetail1 from '@/assets/hero-detail-1.jpg';
import heroDetail2 from '@/assets/hero-detail-2.jpg';
import heroModel from '@/assets/hero-model.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import story1 from '@/assets/story-1.jpg';
import story2 from '@/assets/story-2.jpg';
import type { CommunitySubmission } from '@/types/storefront';

export const SAMPLE_COMMUNITY_POSTS: CommunitySubmission[] = [
  {
    id: 'crew-sample-1',
    displayName: 'Tara D.',
    handle: '@tara.thrifts',
    caption: 'Layered the crimson ruffle knit with utility olive cargos for a rainy coffee run.',
    image: heroDetail2,
    taggedPiece: 'Olive Utility Parachute Cargo Pants',
    createdAt: '2026-11-05T10:00:00Z',
  },
  {
    id: 'crew-sample-2',
    displayName: 'Zoya R.',
    handle: '@zoya.archive',
    caption: '90s plaid corset styled back with baggy vintage denim — found during the weekend drop.',
    image: story1,
    taggedPiece: 'Plaid Halter Corset Top',
    createdAt: '2026-11-01T14:20:00Z',
  },
  {
    id: 'crew-sample-3',
    displayName: 'Arjun & Dev',
    handle: '@thrifted.twinning',
    caption: 'Heavyweight varsity crewnecks and patched carpenter jeans from the unisex rack.',
    image: story2,
    taggedPiece: '90s Varsity Crewneck Sweatshirt',
    createdAt: '2026-10-28T17:40:00Z',
  },
  {
    id: 'crew-sample-4',
    displayName: 'Naina P.',
    handle: '@naina.wears',
    caption: 'Co-ord tailoring that feels timeless without buying brand new.',
    image: rtw1,
    taggedPiece: 'Top & Skirt Co-Ord Set',
    createdAt: '2026-10-21T12:15:00Z',
  },
  {
    id: 'crew-sample-5',
    displayName: 'Sia K.',
    handle: '@sia.editorial',
    caption: 'Warm knits + brass accents layered on vintage silhouettes.',
    image: heroDetail1,
    taggedPiece: 'Crimson Ruffle-Neck Vintage Knit',
    createdAt: '2026-10-16T09:30:00Z',
  },
  {
    id: 'crew-sample-6',
    displayName: 'Maya L.',
    handle: '@maya.circles',
    caption: 'Styled full-frame look from the autumn studio curation.',
    image: heroModel,
    createdAt: '2026-10-12T16:00:00Z',
  },
];

