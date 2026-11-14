import community1 from '@/assets/community-1.webp';
import community2 from '@/assets/community-1.webp';
import lookbook from '@/assets/lookbook.jpg';
import type { EventItem } from '@/types/storefront';

export const SAMPLE_EVENTS: EventItem[] = [
  {
    id: 'evt-winter-swap',
    title: 'The Social Circle: Winter Wardrobe Swap',
    description:
      'Sample community event — bring up to 5 clean pre-loved pieces to trade directly with fellow thrift lovers.',
    fullDetails:
      'A relaxed afternoon wardrobe exchange celebrating circular fashion. Bring freshly laundered jackets, knits, bags, or accessories in good condition and exchange tokens for curated pieces from other attendees.',
    date: 'Saturday, 28 November 2026',
    time: '3:00 PM – 6:30 PM',
    location: 'CircleUp Studio Pop-Up Courtyard (Sample Location)',
    image: community1,
    spotsLabel: 'Sample Event • 40 Spots',
    highlights: [
      'Up to 5 pre-loved items per participant',
      'Basic mending & button-stitching corner',
      'Open styling table with accessories & scarves',
    ],
  },
  {
    id: 'evt-denim-repair',
    title: 'Visible Mending & Upcycled Denim Circle',
    description:
      'Sample studio workshop exploring sashiko stitching, patching vintage jeans, and extending garment life.',
    fullDetails:
      'Bring a pair of worn denim or a favourite chore jacket and learn foundational visible-mending stitches using salvaged cotton threads and fabric scraps.',
    date: 'Sunday, 6 December 2026',
    time: '11:30 AM – 2:00 PM',
    location: 'CircleUp Storefront Table (Sample Location)',
    image: community2,
    spotsLabel: 'Sample Event • 20 Spots',
    highlights: [
      'Salvaged denim patches & thread provided',
      'Beginner-friendly hand-sewing session',
      'Care guide for vintage cotton & wool',
    ],
  },
  {
    id: 'evt-archive-preview',
    title: 'Thrifted Treasure: Offline Rack Preview',
    description:
      'Sample in-person browsing evening featuring one-of-a-kind bags, winter coats, and handcrafted crochet pieces.',
    fullDetails:
      'Browse an early preview rack of seasonal outerwear, archival handbags, and small-batch handcrafted garments before they appear online.',
    date: 'Saturday, 19 December 2026',
    time: '4:00 PM – 8:00 PM',
    location: 'CircleUp Pop-Up Room (Sample Location)',
    image: lookbook,
    spotsLabel: 'Sample Event • Open Entry',
    highlights: [
      'Curated winter coats & knitwear rack',
      'Handcrafted maker showcase table',
      'Plastic-free carryall wrapping station',
    ],
  },
];

