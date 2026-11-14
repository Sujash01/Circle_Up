export type BlobPreset =
  | 'pebble'
  | 'leaf'
  | 'petal'
  | 'wavy-oval'
  | 'mirror'
  | 'arch'
  | 'pill-wobble'
  | 'scalloped';

type Point = readonly [number, number];

function closedCurve(points: readonly Point[]): string {
  const format = (value: number) => value.toFixed(2);
  const first = points[0]!;
  let path = `M ${format(first[0])} ${format(first[1])}`;

  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    const after = points[(index + 2) % points.length]!;
    const cp1: Point = [point[0] + (next[0] - previous[0]) / 6, point[1] + (next[1] - previous[1]) / 6];
    const cp2: Point = [next[0] - (after[0] - point[0]) / 6, next[1] - (after[1] - point[1]) / 6];
    path += ` C ${format(cp1[0])} ${format(cp1[1])}, ${format(cp2[0])} ${format(cp2[1])}, ${format(next[0])} ${format(next[1])}`;
  });

  return `${path} Z`;
}

const presetPoints: Record<BlobPreset, readonly Point[]> = {
  pebble: [[50, 3], [83, 13], [98, 42], [87, 78], [57, 97], [21, 86], [3, 55], [15, 20]],
  leaf: [[50, 2], [73, 13], [91, 39], [78, 70], [50, 98], [22, 70], [9, 39], [27, 13]],
  petal: [[50, 3], [71, 18], [95, 37], [83, 62], [65, 87], [42, 97], [18, 79], [5, 52], [22, 25]],
  'wavy-oval': [[50, 5], [75, 4], [91, 18], [96, 42], [88, 59], [96, 80], [75, 95], [50, 92], [27, 98], [7, 77], [12, 57], [4, 33], [22, 12]],
  mirror: [[50, 2], [76, 8], [91, 28], [96, 50], [91, 72], [76, 92], [50, 98], [24, 92], [9, 72], [4, 50], [9, 28], [24, 8]],
  arch: [[50, 2], [71, 4], [89, 15], [97, 34], [96, 65], [94, 88], [74, 97], [27, 97], [6, 88], [4, 65], [3, 34], [11, 15], [29, 4]],
  'pill-wobble': [[50, 4], [75, 2], [93, 12], [98, 34], [94, 67], [87, 89], [68, 96], [32, 94], [12, 87], [3, 64], [5, 32], [13, 12], [31, 4]],
  scalloped: [[50, 3], [64, 10], [76, 5], [84, 18], [96, 27], [90, 42], [98, 56], [87, 68], [91, 84], [75, 88], [65, 99], [50, 91], [35, 99], [25, 88], [9, 84], [13, 68], [2, 56], [10, 42], [4, 27], [16, 18], [24, 5], [36, 10]],
};

export const BLOB_PRESETS = Object.fromEntries(
  Object.entries(presetPoints).map(([name, points]) => [name, closedCurve(points)]),
) as Record<BlobPreset, string>;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function generateBlobPath(seed: number, pointCount = 8, irregularity = 0.18): string {
  const count = Math.max(6, Math.min(9, Math.round(pointCount)));
  const wobble = Math.max(0, Math.min(0.45, irregularity));
  const random = seededRandom(seed);
  const points = Array.from({ length: count }, (_, index): Point => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2 + (random() - 0.5) * 0.16;
    const radius = 37 + (random() - 0.5) * wobble * 50;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  });
  return closedCurve(points);
}
