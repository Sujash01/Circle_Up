export interface VinePoint { x: number; y: number }
interface VineCubic { c1: VinePoint; c2: VinePoint; end: VinePoint }

const VINE_ENTRY_Y = 72;
const LOOP_MIN_X = -22;
const LOOP_MAX_X = 104;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomFor(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function smoothJoins(start: VinePoint, segments: VineCubic[]): void {
  for (let index = 0; index < segments.length - 1; index += 1) {
    const incoming = segments[index]!;
    const outgoing = segments[index + 1]!;
    const vertex = incoming.end;
    const before = { x: vertex.x - incoming.c2.x, y: vertex.y - incoming.c2.y };
    const after = { x: outgoing.c1.x - vertex.x, y: outgoing.c1.y - vertex.y };
    const beforeLength = Math.hypot(before.x, before.y);
    const afterLength = Math.hypot(after.x, after.y);
    if (!beforeLength || !afterLength) continue;
    const bx = before.x / beforeLength;
    const by = before.y / beforeLength;
    const ax = after.x / afterLength;
    const ay = after.y / afterLength;
    let x = bx + ax;
    let y = by + ay;
    const length = Math.hypot(x, y);
    if (!length) { x = bx; y = by; }
    else { x /= length; y /= length; }
    incoming.c2 = { x: vertex.x - x * beforeLength, y: vertex.y - y * beforeLength };
    outgoing.c1 = { x: vertex.x + x * afterLength, y: vertex.y + y * afterLength };
  }
  void start;
}

/** Authored storybook vine. Coordinates are local to the vine gutter. */
export function createVinePath(
  gutterWidth: number,
  height: number,
  seed = 4817,
  isMobile = gutterWidth < 64,
): string {
  const width = Math.max(44, gutterWidth);
  const mobile = isMobile;
  const random = randomFor(seed);
  const jitter = () => (random() * 16) - 8;
  const loopScale = Math.min(mobile ? 0.55 : 1, (width - 8) / (LOOP_MAX_X - LOOP_MIN_X));
  const loopSpan = (LOOP_MAX_X - LOOP_MIN_X) * loopScale;
  const loopOffset = mobile ? 4 : (width - loopSpan) / 2;
  const loopX = (x: number) => loopOffset + (x - LOOP_MIN_X) * loopScale;

  const start: VinePoint = { x: -140, y: 0 };
  const raw: VineCubic[] = [
    { c1: { x: -80, y: 6 }, c2: { x: -40, y: 20 }, end: { x: -6, y: 40 } },
    { c1: { x: 20, y: 56 }, c2: { x: 62, y: 58 }, end: { x: 84, y: 30 } },
    { c1: { x: 104, y: 4 }, c2: { x: 86, y: -34 }, end: { x: 52, y: -40 } },
    { c1: { x: 18, y: -46 }, c2: { x: -22, y: -20 }, end: { x: -20, y: 20 } },
    { c1: { x: -22, y: 60 }, c2: { x: -8, y: 100 }, end: { x: 4, y: 150 } },
    { c1: { x: 16, y: 200 }, c2: { x: 44, y: 240 }, end: { x: 40, y: 300 } },
    { c1: { x: 36, y: 360 }, c2: { x: 4, y: 400 }, end: { x: 8, y: 470 } },
    { c1: { x: 12, y: 540 }, c2: { x: 46, y: 580 }, end: { x: 42, y: 650 } },
  ];

  let previous = raw[raw.length - 1]!.end;
  let direction = -1;
  let y = 650;
  while (y + VINE_ENTRY_Y < height + 210) {
    const advance = 180 * (0.85 + random() * 0.3);
    const swing = 24 + random() * 20;
    const end = { x: previous.x + direction * swing, y: y + advance };
    const nextDirection = -direction;
    const handle = 3.5 + random() * 3;
    raw.push({
      c1: { x: previous.x + direction * handle, y: y + advance * 0.32 },
      c2: { x: end.x - nextDirection * handle, y: y + advance * 0.68 },
      end,
    });
    previous = end;
    direction = nextDirection;
    y = end.y;
  }

  // Seeded point jitter adds a hand-drawn edge; shared tangents keep every join flowing.
  raw.forEach((segment) => {
    [segment.c1, segment.c2, segment.end].forEach((point) => {
      point.x += jitter();
      point.y += jitter();
    });
  });
  start.x += jitter();
  start.y += jitter();
  smoothJoins(start, raw);

  const tailAnchor = raw[3]!.end;
  const tailBounds = raw.slice(4).flatMap((segment) => [segment.c1.x, segment.c2.x, segment.end.x]);
  const tailReach = Math.max(...tailBounds.map((x) => Math.abs(x - tailAnchor.x)));
  const loopExitX = loopX(tailAnchor.x);
  const tailScale = Math.max(mobile ? 0.6 : 1, (width - (mobile ? 16 : 8)) / tailReach);
  const tailX = (x: number) => loopExitX + (x - tailAnchor.x) * tailScale;

  // Use affine transforms per authored section. The former y-dependent blend
  // bent control handles independently, creating sharp tangent changes at the
  // loop/entry and loop/tail transitions.
  const mapPoint = (point: VinePoint, segmentIndex: number): VinePoint => ({
    x: segmentIndex === 0 ? loopX(point.x) : point.y > tailAnchor.y ? tailX(point.x) : loopX(point.x),
    y: point.y + VINE_ENTRY_Y,
  });
  const mappedStart = { x: -140, y: start.y + VINE_ENTRY_Y };
  const mapped = raw.map((segment, index) => {
    const c1 = mapPoint(segment.c1, index);
    const c2 = mapPoint(segment.c2, index);
    const end = mapPoint(segment.end, index);
    return { c1, c2, end };
  });
  smoothJoins(mappedStart, mapped);
  let path = `M ${mappedStart.x.toFixed(2)} ${mappedStart.y.toFixed(2)}`;
  mapped.forEach(({ c1, c2, end }) => {
    path += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  });
  return path;
}

export function vineGutterForViewport(viewportWidth: number): number {
  if (viewportWidth < 640) return 44;
  if (viewportWidth < 1024) return 68;
  return clamp(viewportWidth * 0.06, 88, 112);
}
