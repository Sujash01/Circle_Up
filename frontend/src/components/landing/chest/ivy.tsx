import type { CSSProperties } from 'react';

export type IvyLeafKind = 'ivy' | 'bud' | 'tendril';

export interface IvyLeafVariation {
  kind: IvyLeafKind;
  side: -1 | 1;
  scale: number;
  angleOffset: number;
  spacingJitter: number;
  tone: string;
}

const LEAF_TONES = ['#2f3e24', '#37482b', '#536445', '#202b18'];

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createIvyLeafVariation(seed: number, index: number): IvyLeafVariation {
  const random = seededRandom((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const kindRoll = random();
  return {
    kind: kindRoll < 0.68 ? 'ivy' : kindRoll < 0.87 ? 'bud' : 'tendril',
    side: random() > 0.5 ? 1 : -1,
    scale: 0.78 + random() * 0.38,
    angleOffset: 34 + random() * 32,
    spacingJitter: random(),
    tone: LEAF_TONES[Math.floor(random() * LEAF_TONES.length)]!,
  };
}

export function IvyLeafArtwork({
  kind,
  tone,
}: {
  kind: IvyLeafKind;
  tone: string;
}) {
  if (kind === 'bud') {
    return (
      <>
        <path d="M0 0C-4-7-3-15 0-22C3-15 4-7 0 0Z" fill={tone} stroke="#202b18" strokeWidth=".8" />
        <path d="M0-3L0-19" fill="none" stroke="#f8f4e2" strokeOpacity=".46" strokeWidth=".8" />
        <circle cx="0" cy="-24" r="2" fill="#f7f3e1" />
      </>
    );
  }

  if (kind === 'tendril') {
    return (
      <>
        <path d="M0 0C-6-7-15-5-15-13C-15-21-5-23-4-17C-3-13-8-12-9-16" fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" />
        <circle cx="-4" cy="-20" r="2.1" fill="#f7f3e1" />
      </>
    );
  }

  return (
    <>
      <path
        d="M0 0C-5-5-17-4-16-13C-15-19-7-21-9-29C-4-26-2-32 0-38C2-32 5-26 9-29C7-21 15-19 16-13C17-4 5-5 0 0Z"
        fill={tone}
        stroke="#202b18"
        strokeWidth=".8"
      />
      <path
        d="M0-2L0-33M0-13L-8-20M0-14L9-21M0-23L-4-28M0-22L5-28"
        fill="none"
        stroke="#f8f4e2"
        strokeOpacity=".46"
        strokeWidth=".8"
      />
    </>
  );
}

interface ChestVine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  waves: number;
  phase: number;
  amplitude: number;
  leafScale?: number;
  spacing?: number;
}

function ChestIvy({
  width,
  height,
  seed,
  vines,
}: {
  width: number;
  height: number;
  seed: number;
  vines: ChestVine[];
}) {
  return (
    <svg className="tc-ivy" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {vines.map((vine, vineIndex) => {
        const samples = 30;
        const dx = vine.x1 - vine.x0;
        const dy = vine.y1 - vine.y0;
        const length = Math.hypot(dx, dy);
        const normalX = -dy / length;
        const normalY = dx / length;
        const points = Array.from({ length: samples + 1 }, (_, index) => {
          const t = index / samples;
          const offset =
            Math.sin(t * vine.waves * Math.PI * 2 + vine.phase) *
            vine.amplitude *
            (0.3 + 0.7 * t);
          return {
            x: vine.x0 + dx * t + normalX * offset,
            y: vine.y0 + dy * t + normalY * offset,
          };
        });
        const stemPath = `M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('L')}`;
        const leafCount = Math.max(1, Math.round(length / (vine.spacing ?? 14)));

        return (
          <g key={`${vineIndex}-${stemPath}`}>
            <path className="tc-stem" pathLength="1" d={stemPath} />
            {Array.from({ length: leafCount }, (_, leafIndex) => {
              const variation = createIvyLeafVariation(seed + vineIndex * 317, leafIndex);
              const t = (leafIndex + 0.6 + variation.spacingJitter * 0.3) / leafCount;
              const sampleIndex = Math.min(samples - 1, Math.floor(t * samples));
              const point = points[sampleIndex]!;
              const next = points[sampleIndex + 1]!;
              const tangent = (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
              const angle =
                tangent +
                variation.side * (variation.angleOffset + 18) +
                90;
              const scale = (vine.leafScale ?? 1) * variation.scale;
              const style = { '--t': t.toFixed(3) } as CSSProperties;

              return (
                <g
                  key={`${vineIndex}-${leafIndex}`}
                  transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${scale.toFixed(2)})`}
                >
                  <g className="tc-gr" style={style}>
                    <IvyLeafArtwork kind={variation.kind} tone={variation.tone} />
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function ChestIvyFront() {
  return (
    <ChestIvy
      width={440}
      height={208}
      seed={7}
      vines={[
        { x0: 18, y0: 212, x1: 88, y1: -18, waves: 1.5, phase: 0, amplitude: 10 },
        { x0: 422, y0: 212, x1: 362, y1: -14, waves: 1.3, phase: 2, amplitude: 10 },
        { x0: 152, y0: -12, x1: 184, y1: 102, waves: 1.2, phase: 1, amplitude: 7, leafScale: 0.95, spacing: 14 },
        { x0: 304, y0: -12, x1: 274, y1: 86, waves: 1.4, phase: 3, amplitude: 7, leafScale: 0.95, spacing: 14 },
      ]}
    />
  );
}

export function ChestIvySide() {
  return (
    <ChestIvy
      width={300}
      height={208}
      seed={19}
      vines={[
        { x0: 16, y0: 212, x1: 72, y1: -16, waves: 1.4, phase: 1, amplitude: 9 },
        { x0: 282, y0: 212, x1: 234, y1: 36, waves: 1.2, phase: 2, amplitude: 8 },
        { x0: 144, y0: -12, x1: 124, y1: 92, waves: 1.5, phase: 0, amplitude: 6, leafScale: 0.95, spacing: 14 },
      ]}
    />
  );
}
