import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createVinePath } from '../frontend/src/components/landing/vinePath.ts';

const PAGE_HEIGHT = 3000;
const OUTPUT_DIR = path.resolve('scripts/out');
const VIEWPORTS = [
  { name: 'desktop', gutter: 160, viewport: 1440, isMobile: false },
  { name: 'mobile', gutter: 48, viewport: 390, isMobile: true },
];

function parsePath(pathData) {
  const tokens = pathData.match(/[MC]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let cursor = 0;
  const number = () => Number(tokens[cursor++]);
  const cubics = [];
  let start;
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'M') start = { x: number(), y: number() };
    else if (command === 'C') {
      const c1 = { x: number(), y: number() };
      const c2 = { x: number(), y: number() };
      const end = { x: number(), y: number() };
      cubics.push({ start, c1, c2, end });
      start = end;
    } else throw new Error(`Unsupported path command: ${command}`);
  }
  return cubics;
}

function cubicPoint(segment, t) {
  const u = 1 - t;
  const a = u ** 3;
  const b = 3 * u ** 2 * t;
  const c = 3 * u * t ** 2;
  const d = t ** 3;
  return {
    x: a * segment.start.x + b * segment.c1.x + c * segment.c2.x + d * segment.end.x,
    y: a * segment.start.y + b * segment.c1.y + c * segment.c2.y + d * segment.end.y,
  };
}

function samplePath(cubics, step = 0.5) {
  const samples = [];
  let length = 0;
  cubics.forEach((segment, segmentIndex) => {
    const divisions = Math.ceil(800 / step);
    for (let i = segmentIndex === 0 ? 0 : 1; i <= divisions; i += 1) {
      const point = cubicPoint(segment, i / divisions);
      if (samples.length) length += Math.hypot(point.x - samples.at(-1).x, point.y - samples.at(-1).y);
      samples.push({ ...point, length, segmentIndex });
    }
  });
  return samples;
}

function sampleAt(samples, distance) {
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].length <= distance) low = middle;
    else high = middle;
  }
  const a = samples[low];
  const b = samples[high];
  const ratio = (distance - a.length) / (b.length - a.length || 1);
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}

function diagnostics(pathData, gutter) {
  const cubics = parsePath(pathData);
  const samples = samplePath(cubics);
  const tail = samples.filter((point) => point.segmentIndex >= 4);
  const tangents = [];
  for (let distance = 4; distance < samples.at(-1).length - 4; distance += 4) {
    const before = sampleAt(samples, distance - 2);
    const after = sampleAt(samples, distance + 2);
    tangents.push(Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI);
  }
  const angleDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  let largestChange = 0;
  let largestChangeAt = 0;
  let nearRun = 0;
  let longestNearRun = 0;
  for (let i = 0; i < tangents.length; i += 1) {
    if (i) {
      const change = angleDifference(tangents[i], tangents[i - 1]);
      if (change > largestChange) { largestChange = change; largestChangeAt = i * 4; }
    }
    const verticalError = Math.abs(Math.abs(tangents[i]) - 90);
    nearRun = verticalError < 2 ? nearRun + 4 : 0;
    longestNearRun = Math.max(longestNearRun, nearRun);
  }
  return {
    commands: 1 + cubics.length,
    onlyMC: [...pathData.matchAll(/[A-Za-z]/g)].every(([command]) => command === 'M' || command === 'C'),
    tailRange: [Math.min(...tail.map((point) => point.x)), Math.max(...tail.map((point) => point.x))],
    tailWidth: Math.max(...tail.map((point) => point.x)) - Math.min(...tail.map((point) => point.x)),
    largestChange,
    largestChangeAt,
    longestNearRun,
    pathMinX: Math.min(...samples.map((point) => point.x)),
    pathMaxX: Math.max(...samples.map((point) => point.x)),
    pathLength: samples.at(-1).length,
  };
}

function makeSvg(pathData, width, height) {
  const left = -165;
  const canvasWidth = width - left;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${height}" viewBox="${left} 0 ${canvasWidth} ${height}">
<rect x="${left}" y="0" width="${canvasWidth}" height="${height}" fill="#f7f3e1"/>
<line x1="0" y1="0" x2="0" y2="${height}" stroke="#a78b51" stroke-width="1.5"/>
<text x="8" y="30" fill="#4d6044" font-family="sans-serif" font-size="16" letter-spacing="1.5">PAGE EDGE</text>
<path d="${pathData}" fill="none" stroke="#1e2a1c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${pathData}" fill="none" stroke="#b9c9a5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
for (const seed of [1, 2, 3]) {
  for (const viewport of VIEWPORTS) {
    const d = createVinePath(viewport.gutter, PAGE_HEIGHT, seed, viewport.isMobile);
    const svg = makeSvg(d, viewport.viewport, PAGE_HEIGHT);
    const name = `vine-seed${seed}-${viewport.name}`;
    await fs.writeFile(path.join(OUTPUT_DIR, `${name}.svg`), svg);
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUTPUT_DIR, `${name}.png`));
    const stats = diagnostics(d, viewport.gutter);
    console.log(`${name}: commands=${stats.commands}; only M/C=${stats.onlyMC}; tail x=[${stats.tailRange.map((x) => x.toFixed(1)).join(', ')}] width=${stats.tailWidth.toFixed(1)}px / gutter=${viewport.gutter}px; max tangent Δ=${stats.largestChange.toFixed(2)}° at ${stats.largestChangeAt}px; longest <2°-vertical run=${stats.longestNearRun}px; whole x=[${stats.pathMinX.toFixed(1)}, ${stats.pathMaxX.toFixed(1)}]; length=${stats.pathLength.toFixed(1)}px`);
  }
}
