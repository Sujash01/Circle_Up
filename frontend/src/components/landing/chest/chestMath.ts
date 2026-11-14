export const CHEST_DEPTH = 300;
export const CHEST_LID_HEIGHT = 124;
export const CHEST_LID_SEGMENTS = 16;
export const SPARK_COUNT = 10;

export const SLOTS_DESKTOP = [
  { x: -190, y: -150, r: -6 },
  { x: 0, y: -205, r: 2 },
  { x: 190, y: -150, r: 5 },
  { x: -190, y: -330, r: -3 },
  { x: 0, y: -385, r: 4 },
  { x: 190, y: -330, r: 7 },
];

export const SLOTS_MOBILE = [
  { x: -165, y: -185, r: -6 },
  { x: 0, y: -220, r: 3 },
  { x: 165, y: -185, r: 5 },
  { x: -165, y: -340, r: -4 },
  { x: 0, y: -375, r: 4 },
  { x: 165, y: -340, r: 7 },
];

export const SHIFT_DESKTOP = 100;
export const SHIFT_MOBILE = 0;

export interface LidFacet {
  id: string;
  className: string;
  transform: string;
  height?: number;
  normalY: number;
  normalZ: number;
  outer: boolean;
  crown?: boolean;
  clipPath?: string;
  depth?: boolean;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

export function easeInOut(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function easeOutBack(value: number): number {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

export function shade(normalY: number, normalZ: number): string {
  const dot = Math.max(0, normalY * -0.72 + normalZ * 0.69);
  const luminance = 0.32 + 0.68 * dot;
  return luminance > 0.72
    ? `rgba(255,245,210,${((luminance - 0.72) * 0.5).toFixed(3)})`
    : `rgba(50,20,0,${((0.72 - luminance) * 0.8).toFixed(3)})`;
}

export function buildLidFacets(): LidFacet[] {
  const radius = CHEST_DEPTH / 2;
  const facets: LidFacet[] = [];

  for (let index = 0; index < CHEST_LID_SEGMENTS; index++) {
    const startAngle = (Math.PI * index) / CHEST_LID_SEGMENTS;
    const endAngle = (Math.PI * (index + 1)) / CHEST_LID_SEGMENTS;
    const start = {
      y: -CHEST_LID_HEIGHT * Math.sin(startAngle),
      z: radius - radius * Math.cos(startAngle),
    };
    const end = {
      y: -CHEST_LID_HEIGHT * Math.sin(endAngle),
      z: radius - radius * Math.cos(endAngle),
    };
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const angle = Math.atan2(dz, dy) * (180 / Math.PI);
    const height = Math.hypot(dy, dz) + 2.5;
    const transform = `translate3d(0,calc(var(--u)*${((start.y + end.y) / 2).toFixed(2)}px),calc(var(--u)*${((start.z + end.z) / 2).toFixed(2)}px)) rotateX(${angle.toFixed(2)}deg)`;
    const normalY = -Math.sin((angle * Math.PI) / 180);
    const normalZ = Math.cos((angle * Math.PI) / 180);
    const crown = index >= CHEST_LID_SEGMENTS - 2;

    facets.push({
      id: `outside-${index}`,
      className: crown ? 'tc-gold tc-st tc-lidcrown' : 'tc-gold tc-st',
      transform,
      height,
      normalY,
      normalZ,
      outer: true,
      crown,
    });
    facets.push({
      id: `lining-${index}`,
      className: 'tc-velvet',
      transform: `${transform} rotateY(180deg)`,
      height,
      normalY,
      normalZ,
      outer: false,
    });
  }

  const clipPoints = Array.from({ length: 25 }, (_, index) => {
    const angle = (Math.PI * index) / 24;
    return `${(50 - 50 * Math.cos(angle)).toFixed(2)}% ${((1 - Math.sin(angle)) * 100).toFixed(2)}%`;
  });
  const clipPath = `polygon(${clipPoints.join(',')},100% 100%,0% 100%)`;
  const caps = [
    { suffix: 'left', transform: 'translate3d(calc(var(--w)/-2),calc(var(--lh)/-2),calc(var(--d)/2)) rotateY(-90deg)', normalY: 0, normalZ: 1 },
    { suffix: 'right', transform: 'translate3d(calc(var(--w)/2),calc(var(--lh)/-2),calc(var(--d)/2)) rotateY(90deg)', normalY: 0, normalZ: 1 },
  ];

  caps.forEach((cap) => {
    facets.push({
      id: `cap-outside-${cap.suffix}`,
      className: 'tc-gold',
      transform: cap.transform,
      normalY: cap.normalY,
      normalZ: cap.normalZ,
      outer: true,
      clipPath,
      depth: true,
    });
    facets.push({
      id: `cap-lining-${cap.suffix}`,
      className: 'tc-velvet',
      transform: `${cap.transform} rotateY(180deg)`,
      normalY: cap.normalY,
      normalZ: cap.normalZ,
      outer: false,
      clipPath,
      depth: true,
    });
  });

  return facets;
}
