import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import bag1 from '@/assets/bag-1.jpg';
import community1 from '@/assets/community-1.jpg';
import heroDetail1 from '@/assets/hero-detail-1.jpg';
import heroDetail2 from '@/assets/hero-detail-2.jpg';
import lookbook from '@/assets/lookbook.jpg';
import rtw2 from '@/assets/rtw-2.jpg';
import './TreasureChestHero.css';

interface ChestProduct {
  name: string;
  price: string;
  tag: string;
  bg: [string, string];
  img: string;
  to: string;
}

const CHEST_PRODUCTS: ChestProduct[] = [
  {
    name: 'Olive Cargo Pants',
    price: '₹1,890',
    tag: 'Size 28/30',
    bg: ['#c9d3b0', '#9fae80'],
    img: heroDetail2,
    to: '/product/olive-utility-parachute-cargo-pants',
  },
  {
    name: 'Crimson Ruffle Knit',
    price: '₹1,450',
    tag: 'Size S/M',
    bg: ['#f1b9b0', '#d9786f'],
    img: heroDetail1,
    to: '/product/crimson-ruffle-neck-vintage-knit',
  },
  {
    name: 'Denim Fit & Flare Set',
    price: '₹1,950',
    tag: 'Size XS/S',
    bg: ['#bfd0dc', '#8aa6bc'],
    img: rtw2,
    to: '/product/denim-fit-and-flare-co-ord-set',
  },
  {
    name: 'Retro Gum-Sole Trainers',
    price: '₹2,200',
    tag: 'UK 8',
    bg: ['#e9a9a2', '#b9363c'],
    img: community1,
    to: '/product/retro-gum-sole-court-trainers',
  },
  {
    name: 'Botanical Silk Scarf',
    price: '₹750',
    tag: 'Free',
    bg: ['#f2dcae', '#d6b26a'],
    img: lookbook,
    to: '/product/botanical-silk-square-scarf',
  },
  {
    name: 'Textured Handheld Bag',
    price: '₹2,550',
    tag: 'One Size',
    bg: ['#d9cdb5', '#a89572'],
    img: bag1,
    to: '/product/textured-handheld-bag',
  },
];

const SLOTS_DESKTOP = [
  { x: -50, y: -117, r: -5 },
  { x: -240, y: 123, r: -3 },
  { x: -430, y: -117, r: -4 },
  { x: -50, y: 108, r: 4 },
  { x: -240, y: -102, r: 3 },
  { x: -430, y: 108, r: 5 },
];

const SLOTS_MOBILE = [
  { x: -130, y: -190, r: -5 },
  { x: 130, y: -190, r: 5 },
  { x: -130, y: -400, r: 4 },
  { x: 130, y: -400, r: -5 },
];

const SHIFT_DESKTOP = 365;
const SHIFT_MOBILE = 0;
const CD = 300;
const CLH = 124;
const STRIPS = 16;
const SPARK_COUNT = 10;

interface FloatingGarment {
  kind: 'tee' | 'dress' | 'jacket' | 'sweater' | 'skirt' | 'pants';
  fill: string;
}

const FLOATING_GARMENTS: FloatingGarment[] = [
  { kind: 'dress', fill: '#e5a69c' },
  { kind: 'sweater', fill: '#c9d3b0' },
  { kind: 'jacket', fill: '#8aa6bc' },
  { kind: 'tee', fill: '#f8f4e2' },
  { kind: 'skirt', fill: '#b8474c' },
  { kind: 'pants', fill: '#6e7f5a' },
  { kind: 'sweater', fill: '#d8b55d' },
  { kind: 'dress', fill: '#b8474c' },
  { kind: 'tee', fill: '#c9d3b0' },
  { kind: 'jacket', fill: '#708ea4' },
  { kind: 'skirt', fill: '#f2dcae' },
  { kind: 'pants', fill: '#9f8760' },
];

const GARMENT_PATHS: Record<FloatingGarment['kind'], string> = {
  tee: 'M14 8L20 11L26 8L35 13L31 20L27 18V33H13V18L9 20L5 13Z',
  dress: 'M15 7H25L27 17L33 34H7L13 17ZM15 7L12 13M25 7L28 13',
  jacket: 'M13 8L20 13L27 8L35 14L33 25L28 24V33H12V24L7 25L5 14ZM20 13V33',
  sweater: 'M15 8C17 11 23 11 25 8L35 14L32 23L27 21V33H13V21L8 23L5 14Z',
  skirt: 'M13 10H27L34 32H6ZM16 10L14 31M24 10L26 31',
  pants: 'M12 8H28L30 34H22L20 19L18 34H10Z',
};

function rng(initialSeed: number) {
  let seed = initialSeed;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAF_D =
  'M0 0C-3 -4-10 -6-9 -11C-8 -14-5 -14-6 -18C-4 -17-2 -21 0 -26C2 -21 4 -17 6 -18C5 -14 8 -14 9 -11C10 -6 3 -4 0 0Z';
const GREENS = ['#2f4a2c', '#3d5e3a', '#4a7243', '#35542f', '#56804a'];

interface VineSpec {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  f: number;
  ph: number;
  amp: number;
  ls?: number;
  gap?: number;
}

function buildIvyMarkup(width: number, height: number, seed: number, vines: VineSpec[]): string {
  const random = rng(seed);
  let stems = '';
  let leavesMarkup = '';

  vines.forEach((v) => {
    const n = 30;
    const pts: Array<[number, number]> = [];
    const dx = v.x1 - v.x0;
    const dy = v.y1 - v.y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;

    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const o = Math.sin(t * v.f * Math.PI * 2 + v.ph) * v.amp * (0.3 + 0.7 * t);
      pts.push([v.x0 + dx * t + nx * o, v.y0 + dy * t + ny * o]);
    }

    stems += `<path class="tc-stem" pathLength="1" d="M${pts
      .map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join('L')}"/>`;

    const leafCount = Math.round(len / (v.gap ?? 12));
    for (let k = 0; k < leafCount; k++) {
      const t = (k + 0.6) / leafCount;
      const idx = Math.min(n - 1, Math.floor(t * n));
      const a = pts[idx]!;
      const b = pts[idx + 1]!;
      const th = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const side = k % 2 ? 1 : -1;
      const rot = th + side * (50 + random() * 25) + 90;
      const sc = (v.ls ?? 1) * (0.8 + random() * 0.55);
      const col = GREENS[Math.floor(random() * GREENS.length)] ?? '#2f4a2c';

      leavesMarkup += `<g transform="translate(${a[0].toFixed(1)} ${a[1].toFixed(1)}) rotate(${rot.toFixed(0)}) scale(${sc.toFixed(2)})"><g class="tc-gr" style="--t:${t.toFixed(3)}"><path d="${LEAF_D}" fill="${col}" stroke="#1f3320" stroke-width=".9"/><path d="M0 0L0 -21M0 -9L-5 -13M0 -9L5 -13" stroke="rgba(235,245,210,.28)" stroke-width=".8" fill="none"/></g></g>`;
    }
  });

  return `<svg class="tc-ivy" viewBox="0 0 ${width} ${height}" aria-hidden="true">${stems}${leavesMarkup}</svg>`;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function shade(ny: number, nz: number): string {
  const dot = Math.max(0, ny * -0.72 + nz * 0.69);
  const lum = 0.32 + 0.68 * dot;
  return lum > 0.72
    ? `rgba(255,245,210,${((lum - 0.72) * 0.5).toFixed(3)})`
    : `rgba(50,20,0,${((0.72 - lum) * 0.8).toFixed(3)})`;
}

/**
 * Interactive 3D scroll-driven treasure chest hero ported from hero (2).html
 * and wired with CircleUp's real catalog products and React Router links.
 */
export function TreasureChestHero() {
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const frRef = useRef<HTMLDivElement>(null);
  const rtRef = useRef<HTMLDivElement>(null);
  const backRigRef = useRef<HTMLDivElement>(null);
  const frontRigRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);
  const underglowRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  const leavesRef = useRef<SVGGElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const exploreBtnRef = useRef<HTMLAnchorElement>(null);

  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const garmentRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 760 : false,
  );

  const activeSlots = isMobile ? SLOTS_MOBILE : SLOTS_DESKTOP;
  const visibleProducts = CHEST_PRODUCTS.slice(0, activeSlots.length);

  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    const scene = sceneRef.current;
    const lid = lidRef.current;
    const fr = frRef.current;
    const rt = rtRef.current;
    if (!hero || !stage || !scene || !lid || !fr || !rt) return;

    const strips: Array<{ el: HTMLDivElement; ny: number; nz: number }> = [];
    const garmentPhysics = FLOATING_GARMENTS.map((_, i) => ({
      vx: (((i * 53) % 100) - 50) * 5.2,
      h: 150 + ((i * 37) % 120),
      tilt: (i % 2 === 0 ? -1 : 1) * (14 + ((i * 19) % 20)),
    }));

    // Build arched 3D lid facets
    lid.innerHTML = '';
    const a = CD / 2;
    const b = CLH;
    const rad = Math.PI / 180;
    const pointAt = (k: number) => {
      const ph = (Math.PI * k) / STRIPS;
      return { y: -b * Math.sin(ph), z: a - a * Math.cos(ph) };
    };
    const addFacet = (cls: string, css: string) => {
      const d = document.createElement('div');
      d.className = `tc-f ${cls}`;
      d.style.cssText = css;
      lid.appendChild(d);
      return d;
    };

    for (let k = 0; k < STRIPS; k++) {
      const p0 = pointAt(k);
      const p1 = pointAt(k + 1);
      const dy = p1.y - p0.y;
      const dz = p1.z - p0.z;
      const len = Math.hypot(dy, dz) + 2.5;
      const ym = ((p0.y + p1.y) / 2).toFixed(2);
      const zm = ((p0.z + p1.z) / 2).toFixed(2);
      const ang = Math.atan2(dz, dy) / rad;
      const tf = `translate3d(0,calc(var(--u)*${ym}px),calc(var(--u)*${zm}px)) rotateX(${ang.toFixed(2)}deg)`;
      const sizeCss = `--fw:var(--w);--fh:calc(var(--u)*${len.toFixed(2)}px);`;
      const isCrownRim = k >= STRIPS - 2;
      const out = addFacet(
        isCrownRim ? 'tc-gold tc-st tc-lidcrown' : 'tc-gold tc-st',
        `${sizeCss}transform:${tf}`,
      );
      addFacet('tc-velvet', `${sizeCss}transform:${tf} rotateY(180deg)`);
      strips.push({ el: out, ny: -Math.sin(ang * rad), nz: Math.cos(ang * rad) });
    }

    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const ph = (Math.PI * i) / 24;
      pts.push(`${(50 - 50 * Math.cos(ph)).toFixed(2)}% ${((1 - Math.sin(ph)) * 100).toFixed(2)}%`);
    }
    pts.push('100% 100%', '0% 100%');
    const clip = `clip-path:polygon(${pts.join(',')});`;
    const capSize = `--fw:var(--d);--fh:var(--lh);${clip}`;
    const leftTf = `translate3d(calc(var(--w)/-2),calc(var(--lh)/-2),calc(var(--d)/2)) rotateY(-90deg)`;
    const rightTf = `translate3d(calc(var(--w)/2),calc(var(--lh)/-2),calc(var(--d)/2)) rotateY(90deg)`;
    addFacet('tc-gold', `${capSize}transform:${leftTf};--ov:rgba(50,20,0,.12)`);
    addFacet('tc-velvet', `${capSize}transform:${leftTf} rotateY(180deg)`);
    addFacet('tc-gold', `${capSize}transform:${rightTf};--ov:rgba(50,20,0,.3)`);
    addFacet('tc-velvet', `${capSize}transform:${rightTf} rotateY(180deg)`);

    // Build chest face ivy matching bulkier 440x208 front & 300x208 side
    fr.querySelectorAll('.tc-ivy').forEach((el) => el.remove());
    rt.querySelectorAll('.tc-ivy').forEach((el) => el.remove());
    fr.insertAdjacentHTML(
      'beforeend',
      buildIvyMarkup(440, 208, 7, [
        { x0: 18, y0: 212, x1: 88, y1: -18, f: 1.5, ph: 0, amp: 10 },
        { x0: 422, y0: 212, x1: 362, y1: -14, f: 1.3, ph: 2, amp: 10 },
        { x0: 152, y0: -12, x1: 184, y1: 102, f: 1.2, ph: 1, amp: 7, ls: 0.95, gap: 14 },
        { x0: 304, y0: -12, x1: 274, y1: 86, f: 1.4, ph: 3, amp: 7, ls: 0.95, gap: 14 },
      ]),
    );
    rt.insertAdjacentHTML(
      'beforeend',
      buildIvyMarkup(300, 208, 19, [
        { x0: 16, y0: 212, x1: 72, y1: -16, f: 1.4, ph: 1, amp: 9 },
        { x0: 282, y0: 212, x1: 234, y1: 36, f: 1.2, ph: 2, amp: 8 },
        { x0: 144, y0: -12, x1: 124, y1: 92, f: 1.5, ph: 0, amp: 6, ls: 0.95, gap: 14 },
      ]),
    );
    const ivies = [...hero.querySelectorAll<SVGElement>('.tc-ivy')];

    let u = 1;
    let navHeight = 76;
    const sizeUp = () => {
      const mobile = window.innerWidth < 760;
      const headerEl = document.querySelector('header');
      navHeight = headerEl ? headerEl.offsetHeight : 76;
      hero.style.setProperty('--tc-nav-h', `${navHeight}px`);

      const sh = stage.offsetHeight || window.innerHeight - navHeight;
      u = mobile
        ? Math.min(Math.max(window.innerWidth / 590, 0.52), 0.92)
        : Math.min(Math.max(Math.min(window.innerWidth / 1480, sh / 775), 0.48), 1.18);
      hero.style.setProperty('--u', u.toFixed(3));
    };

    sizeUp();

    let ptx = 0;
    let pty = 0;
    let sx = 0;
    let sy = 0;
    const onPointerMove = (e: PointerEvent) => {
      ptx = (e.clientX / window.innerWidth - 0.5) * 2;
      pty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      sizeUp();
      const nextMobile = window.innerWidth < 760;
      setIsMobile((prev) => (prev !== nextMobile ? nextMobile : prev));
    };
    window.addEventListener('resize', onResize, { passive: true });

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const getTarget = () => {
      const r = hero.getBoundingClientRect();
      const track = Math.max(1, hero.offsetHeight - stage.offsetHeight);
      return clamp((navHeight - r.top) / track);
    };

    const render = (p: number, now: number) => {
      const slots = window.innerWidth < 760 ? SLOTS_MOBILE : SLOTS_DESKTOP;
      const shift = window.innerWidth < 760 ? SHIFT_MOBILE : SHIFT_DESKTOP;
      const N = slots.length;

      const o = clamp((p - 0.01) / 0.36);
      const lidAng = 120 * easeOutBack(o);
      lid.style.setProperty('--lid', `${lidAng.toFixed(2)}deg`);
      const slide = easeInOut(clamp((p - 0.08) / 0.36));

      const first = 0.16;
      const dur = 0.42;
      const step = (0.86 - first - dur) / Math.max(1, N - 1);
      let kick = 0;
      let kickZ = 0;
      for (let i = 0; i < N; i++) {
        const k = Math.sin(Math.PI * clamp((p - (first + i * step)) / 0.08));
        kick += k;
        kickZ += (i % 2 ? -1 : 1) * k * 1.1;
      }

      const amp = p < 0.05 ? p / 0.05 : Math.max(0, 1 - (p - 0.05) / 0.08);
      const shakeX = Math.sin(now / 26) * 2.2 * u * amp;
      const shakeZ = Math.sin(now / 36) * 1.1 * amp;
      const turn = shift ? 1 : 0.25;
      // Gentler 2.5D angles for a flatter, crisp storybook-chest presentation
      const yaw =
        lerp(-22, -12, easeOutCubic(clamp(p / 0.2))) -
        14 * slide * turn +
        Math.sin(now / 1700) * 1.5 +
        sx * 3.5;
      const pitch = -11 - 5 * slide * turn + Math.sin(now / 2100) * 0.8 - sy * 1.5;
      const rz = shakeZ - 3 * slide * turn + kickZ * 0.7;
      const bob = Math.sin(now / 1000) * 3.5 * u;
      const bump =
        (1 + Math.sin(Math.PI * clamp((p - 0.06) / 0.12)) * 0.05 + kick * 0.025) *
        (1 - 0.08 * slide);

      const tf = `translate3d(${shakeX.toFixed(1)}px,${bob.toFixed(1)}px,0) rotateZ(${rz.toFixed(2)}deg) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) scale3d(${bump.toFixed(3)},${bump.toFixed(3)},${bump.toFixed(3)})`;
      if (backRigRef.current) backRigRef.current.style.transform = tf;
      if (frontRigRef.current) frontRigRef.current.style.transform = tf;

      const off = shift * u * slide;
      scene.style.transform = `translate3d(${off.toFixed(1)}px,0,0)`;

      const L = (lidAng * Math.PI) / 180;
      const cL = Math.cos(L);
      const sL = Math.sin(L);
      strips.forEach((s) => {
        const ny = s.ny * cL - s.nz * sL;
        const nz = s.ny * sL + s.nz * cL;
        s.el.style.setProperty('--ov', shade(ny, nz));
      });

      const g = reduce ? 1 : 0.45 + 0.55 * clamp(p / 0.7);
      ivies.forEach((el) => el.style.setProperty('--g', g.toFixed(3)));

      if (glowRef.current) glowRef.current.style.opacity = (o * 0.8).toFixed(3);
      if (underglowRef.current) underglowRef.current.style.opacity = o.toFixed(3);
      if (raysRef.current) {
        raysRef.current.style.opacity = (o * 0.7 * (1 - clamp((p - 0.9) / 0.1) * 0.5)).toFixed(3);
        raysRef.current.style.transform = `rotate(${(now / 120 + p * 160).toFixed(1)}deg)`;
      }
      if (sparksRef.current) sparksRef.current.style.opacity = o > 0.6 ? '1' : '0';

      garmentRefs.current.forEach((garmentEl, i) => {
        const g = garmentPhysics[i];
        if (!garmentEl || !g) return;
        const t = clamp((p - (0.05 + i * 0.012)) / 0.36);
        const e = easeOutCubic(t);
        const x = g.vx * u * e;
        const y = -65 * u - g.h * u * 4 * t * (1 - t) + 135 * u * t * t;
        const sway = Math.sin(now / 360 + i * 1.4) * 8 + g.tilt * e;
        const sc = 0.72 + 0.4 * Math.sin(Math.PI * t);
        const op = t <= 0 ? 0 : t > 0.78 ? 1 - (t - 0.78) / 0.22 : 1;
        garmentEl.style.opacity = op.toFixed(2);
        garmentEl.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${sway.toFixed(1)}deg) scale(${sc.toFixed(2)})`;
      });

      let found = 0;
      for (let i = 0; i < N; i++) {
        const cardEl = cardRefs.current[i];
        const s = slots[i];
        if (!cardEl || !s) continue;

        const t = clamp((p - (first + i * step)) / dur);
        const e = easeOutCubic(t);
        if (t >= 0.5) found++;
        const fb = Math.sin((now / 1000) * 1.3 + i * 1.7) * 5 * u * e;
        const x = lerp(0, s.x * u - off, e);
        const y = lerp(-60 * u, s.y * u, e) - Math.sin(Math.PI * t) * 120 * u + fb;
        const rot = s.r + (1 - e) * (s.r >= 0 ? -25 : 25);
        const sc = 0.35 + 0.65 * e;
        cardEl.style.opacity = clamp(t * 3.5).toFixed(3);
        cardEl.style.pointerEvents = t >= 0.85 ? 'auto' : 'none';
        cardEl.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      }

      const fo = (1 - clamp((p - 0.12) / 0.18)).toFixed(3);
      if (asideRef.current) asideRef.current.style.opacity = fo;
      if (taglineRef.current) taglineRef.current.style.opacity = fo;
      if (exploreBtnRef.current) exploreBtnRef.current.style.opacity = fo;
      if (copyRef.current) {
        copyRef.current.style.transform = `translateY(${shift ? (-24 * p).toFixed(1) : 0}px)`;
      }

      if (hintRef.current) {
        hintRef.current.style.opacity = (1 - clamp(p / 0.08)).toFixed(3);
        hintRef.current.style.display = p > 0.09 ? 'none' : 'flex';
      }
      if (countRef.current) {
        countRef.current.style.opacity = p > 0.08 && p < 0.84 ? '1' : '0';
        countRef.current.textContent = `${found} of ${N} finds out`;
        countRef.current.style.display = p >= 0.84 ? 'none' : 'block';
      }
      if (ctaRef.current) {
        ctaRef.current.classList.toggle('on', p >= 0.84);
      }
      hero.style.setProperty('--tc-open', o.toFixed(3));

      if (stemRef.current) {
        stemRef.current.style.strokeDashoffset = (1 - (0.25 + 0.75 * p)).toFixed(3);
      }
      const reach = (0.25 + 0.75 * p) * 600;
      if (leavesRef.current) {
        [...leavesRef.current.children].forEach((leafNode) => {
          const cy = Number(leafNode.getAttribute('cy') ?? 0);
          (leafNode as SVGElement).style.opacity = clamp((reach - cy) / 40).toFixed(3);
        });
      }
    };

    if (reduce) {
      hero.style.height = 'auto';
      stage.style.height = '680px';
      render(1, 0);
      return () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('resize', onResize);
      };
    }

    let cur = getTarget();
    let goal = cur;
    render(cur, performance.now());

    let rafId = 0;
    const frame = (now: number) => {
      goal = getTarget();
      cur += (goal - cur) * 0.14;
      if (Math.abs(goal - cur) < 0.0005) cur = goal;
      sx += (ptx - sx) * 0.06;
      sy += (pty - sy) * 0.06;

      const r = hero.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) {
        render(cur, now);
      }
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
    };
  }, [isMobile]);

  return (
    <section ref={heroRef} className="tc-hero" id="hero" aria-label="CircleUp treasure chest">
      <div ref={stageRef} className="tc-stage">
        <svg className="tc-vine" viewBox="0 0 80 600" preserveAspectRatio="none" aria-hidden="true">
          <path
            ref={stemRef}
            className="tc-stem"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1}
            d="M40 0 C 30 80, 52 140, 40 210 S 30 330, 42 400 S 36 500, 40 590"
          />
          <g ref={leavesRef}>
            <ellipse className="tc-leaf" cx="58" cy="150" rx="15" ry="9" transform="rotate(25 58 150)" />
            <ellipse className="tc-leaf" cx="22" cy="300" rx="16" ry="9" transform="rotate(-20 22 300)" />
            <ellipse className="tc-leaf" cx="58" cy="430" rx="13" ry="8" transform="rotate(30 58 430)" />
          </g>
        </svg>

        <div ref={copyRef} className="tc-copy">
          <h1>
            Fashion
            <br />
            That Lasts!
          </h1>
          <p>
            Handpicked Thrift Treasures, Each With A Story. Sustainable, Timeless, And Full Of
            Character. Waiting For Their Next Chapter.
          </p>
        </div>

        <div ref={asideRef} className="tc-aside">
          one-of-a-kind pieces with a story, ready to be yours!
        </div>

        <div ref={taglineRef} className="tc-tagline">
          Curated Vintage &amp;
          <br />
          Thrift Finds,
          <br />
          Just For You!
        </div>

        <Link ref={exploreBtnRef} className="tc-btn" to="/new-arrivals">
          Explore More
        </Link>

        <div ref={sceneRef} className="tc-scene">
          <div className="tc-sun" />
          <div className="tc-shadow" />
          <div ref={underglowRef} className="tc-underglow" />

          {/* Back layer */}
          <div className="tc-layer">
            <div ref={backRigRef} className="tc-rig">
              <div className="tc-f tc-velvet tc-back" />
              <div className="tc-f tc-velvet tc-left" />
              <div className="tc-f tc-velvet tc-floor" />
              <div className="tc-f tc-pile tc-pilef" />
              <div className="tc-f tc-gold tc-rimb" />
              <div className="tc-f tc-gold tc-riml" />
              <div ref={lidRef} className="tc-lid" />
            </div>
          </div>

          {/* Middle layer: rays, glow, sparks, glowing clothes, flying product cards */}
          <div className="tc-cards">
            <div ref={raysRef} className="tc-rays" />
            <div ref={glowRef} className="tc-glow" />
            <div ref={sparksRef} className="tc-sparks">
              {Array.from({ length: SPARK_COUNT }, (_, i) => (
                <i
                  key={i}
                  style={
                    {
                      left: `${(i - 5) * 26}px`,
                      '--sx': `${(i % 2 ? 1 : -1) * (10 + i * 4)}px`,
                      animationDelay: `${(i * 0.27).toFixed(2)}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>

            {FLOATING_GARMENTS.map((garment, i) => (
              <div
                key={`${garment.kind}-${i}`}
                ref={(el) => {
                  garmentRefs.current[i] = el;
                }}
                className="tc-garment"
                aria-hidden="true"
              >
                <svg viewBox="0 0 40 40">
                  <path
                    d={GARMENT_PATHS[garment.kind]}
                    fill={garment.fill}
                    stroke="#24331f"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ))}

            {visibleProducts.map((item, i) => (
              <Link
                key={item.to}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                to={item.to}
                aria-label={`${item.name}, ${item.price}`}
                className="tc-card"
              >
                <span className="tc-tag">{item.tag}</span>
                <div
                  className="tc-ph"
                  style={{
                    background: `linear-gradient(160deg,${item.bg[0]},${item.bg[1]})`,
                  }}
                >
                  <img src={item.img} alt={item.name} loading="lazy" />
                </div>
                <div>
                  <span className="tc-nm">{item.name}</span>
                  <span className="tc-pr">{item.price}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Front layer */}
          <div className="tc-layer">
            <div ref={frontRigRef} className="tc-rig">
              <div ref={frRef} className="tc-f tc-gold tc-st tc-fr">
                <div className="tc-lock" />
              </div>
              <div ref={rtRef} className="tc-f tc-gold tc-st tc-rt">
                <div className="tc-handle" />
              </div>
              <div className="tc-f tc-gold tc-rimf" />
              <div className="tc-f tc-gold tc-rimr" />
            </div>
          </div>
        </div>

        <div className="tc-hud">
          <div className="tc-hud-slot">
            <div ref={hintRef} className="tc-hint">
              <div className="tc-mouse" />
              <span>Scroll to open the chest</span>
            </div>
            <div ref={countRef} className="tc-count" />
            <div ref={ctaRef} className="tc-hud-actions">
              <Link className="tc-cta" to="/new-arrivals">
                Browse all finds →
              </Link>
              <a
                href="#ready-to-wear"
                className="tc-cta tc-cta-down"
                onClick={(e) => {
                  const target = document.getElementById('ready-to-wear');
                  if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                Explore collections ↓
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

