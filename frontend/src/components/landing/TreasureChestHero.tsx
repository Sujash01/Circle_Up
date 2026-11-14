import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import bag1 from '@/assets/bag-1.jpg';
import bag2 from '@/assets/bag-2.jpg';
import heroDetail1 from '@/assets/hero-detail-1.jpg';
import lookbook from '@/assets/lookbook.jpg';
import rtw2 from '@/assets/rtw-2.jpg';
import rtw3 from '@/assets/rtw-3.jpg';
import rtw4 from '@/assets/rtw-4.jpg';
import { ChestModel } from './chest/ChestModel';
import { formatPrice } from '@/services/cartService';
import {
  clamp,
  easeInOut,
  easeOutBack,
  easeOutCubic,
  lerp,
  SHIFT_DESKTOP,
  SHIFT_MOBILE,
  SLOTS_DESKTOP,
  SLOTS_MOBILE,
  SPARK_COUNT,
} from './chest/chestMath';
import { useChestScroll } from './chest/useChestScroll';
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
    name: 'Winter Cardigan Coat',
    price: formatPrice(1890),
    tag: 'Vintage find',
    bg: ['#c9d3b0', '#9fae80'],
    img: lookbook,
    to: '/product/winter-cardigan-coat',
  },
  {
    name: 'Top & Skirt Co-Ord Set',
    price: formatPrice(4000),
    tag: 'Vintage find',
    bg: ['#e7e1ce', '#c8d3b0'],
    img: heroDetail1,
    to: '/product/top-and-skirt-co-ord-set',
  },
  {
    name: 'Denim Fit & Flare Set',
    price: formatPrice(1950),
    tag: 'Size XS/S',
    bg: ['#bfd0dc', '#8aa6bc'],
    img: rtw2,
    to: '/product/denim-fit-and-flare-co-ord-set',
  },
  {
    name: 'Textured Bowling Sling Bag',
    price: formatPrice(1850),
    tag: 'One size',
    bg: ['#e7e1ce', '#c8d3b0'],
    img: bag2,
    to: '/product/textured-bowling-sling-bag',
  },
  {
    name: 'Blazer With Skirt Co-Ord Set',
    price: formatPrice(3550),
    tag: 'Vintage find',
    bg: ['#e7e1ce', '#c8d3b0'],
    img: rtw3,
    to: '/product/blazer-with-skirt-co-ord-set',
  },
  {
    name: 'Textured Handheld Bag',
    price: formatPrice(2550),
    tag: 'One Size',
    bg: ['#d9cdb5', '#a89572'],
    img: bag1,
    to: '/product/textured-handheld-bag',
  },
];

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

/**
 * Interactive 3D scroll-driven treasure chest hero ported from hero (2).html
 * and wired with CircleUp's real catalog products and React Router links.
 */
export function TreasureChestHero() {
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const frontFaceRef = useRef<HTMLDivElement>(null);
  const sideFaceRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const backRigRef = useRef<HTMLDivElement>(null);
  const frontRigRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);
  const underglowRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const exploreBtnRef = useRef<HTMLAnchorElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const hudActionsRef = useRef<HTMLDivElement>(null);

  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const garmentRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRendererRef = useRef<(progress: number, now: number) => void>(() => {});

  const visibleProducts = CHEST_PRODUCTS;
  useChestScroll(heroRef, stageRef, frameRendererRef);

  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    const scene = sceneRef.current;
    const lid = lidRef.current;
    if (!hero || !stage || !scene || !lid) return;

    const garmentPhysics = FLOATING_GARMENTS.map((_, i) => ({
      vx: (((i * 53) % 100) - 50) * 5.2,
      h: 150 + ((i * 37) % 120),
      tilt: (i % 2 === 0 ? -1 : 1) * (14 + ((i * 19) % 20)),
    }));
    const ivies = [...hero.querySelectorAll<SVGElement>('.tc-ivy')];

    let u = 1;
    let cardU = 1;
    let displayedFindCount = -1;
    let navHeight = 76;
    const headerEl = document.querySelector('header');
    const bannerEl = headerEl?.previousElementSibling;
    const sizeUp = () => {
      const mobile = window.innerWidth < 760;
      navHeight = headerEl ? headerEl.offsetHeight : 76;
      hero.style.setProperty('--tc-nav-h', `${navHeight}px`);
      hero.style.setProperty('--tc-banner-h', `${bannerEl?.getBoundingClientRect().height ?? 40}px`);

      const sh = stage.getBoundingClientRect().height || window.innerHeight - navHeight;
      u = mobile
        ? clamp((window.innerWidth * 0.62) / 440, 0.46, 0.58)
        : clamp(Math.min((window.innerWidth * 0.29) / 440, sh / 590), 0.64, 1.08);
      cardU = mobile ? Math.max(u, 0.68) : u;
      hero.style.setProperty('--u', u.toFixed(3));
      hero.style.setProperty('--card-u', cardU.toFixed(3));
    };

    sizeUp();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sizeUp);
    resizeObserver?.observe(hero);
    resizeObserver?.observe(stage);
    if (headerEl) resizeObserver?.observe(headerEl);
    if (bannerEl instanceof Element) resizeObserver?.observe(bannerEl);

    let ptx = 0;
    let pty = 0;
    let sx = 0;
    let sy = 0;
    const onPointerMove = (e: PointerEvent) => {
      ptx = (e.clientX / window.innerWidth - 0.5) * 2;
      pty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const render = (p: number, now: number) => {
      const slots = window.innerWidth < 760 ? SLOTS_MOBILE : SLOTS_DESKTOP;
      const shift = window.innerWidth < 760 ? SHIFT_MOBILE : SHIFT_DESKTOP;
      const N = slots.length;

      const o = clamp((p - 0.01) / 0.36);
      const lidAng = 16 + 96 * easeOutCubic(o);
      lid.style.setProperty('--lid', `${lidAng.toFixed(2)}deg`);
      if (shadowRef.current) {
        shadowRef.current.style.transform = `scale(${(1 + o * 0.08).toFixed(3)},${(1 - o * 0.12).toFixed(3)})`;
        shadowRef.current.style.opacity = `${(0.82 - o * 0.18).toFixed(3)}`;
      }
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

      const amp = p < 0.1 ? 1 - p / 0.1 : 0;
      const shakeX = Math.sin(now / 820) * 1.2 * u * amp;
      const shakeZ = Math.sin(now / 920) * 0.6 * amp;
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

      const g = 0.45 + 0.55 * clamp(p / 0.7);
      ivies.forEach((el) => {
        el.style.opacity = g.toFixed(3);
      });

      if (glowRef.current) glowRef.current.style.opacity = (0.24 + o * 0.52).toFixed(3);
      if (underglowRef.current) underglowRef.current.style.opacity = (0.12 + o * 0.45).toFixed(3);
      if (raysRef.current) {
        raysRef.current.style.opacity = (o * 0.7 * (1 - clamp((p - 0.9) / 0.1) * 0.5)).toFixed(3);
        raysRef.current.style.transform = `rotate(${(now / 120 + p * 160).toFixed(1)}deg)`;
      }
      if (sparksRef.current) sparksRef.current.style.opacity = o > 0.6 ? '1' : '0';

      garmentRefs.current.forEach((garmentEl, i) => {
        const g = garmentPhysics[i];
        if (!garmentEl || !g) return;
        const t = clamp((p - (0.03 + i * 0.012)) / 0.38);
        const e = easeOutCubic(t);
        const x = g.vx * u * e;
        const y = -55 * u - g.h * u * 4 * t * (1 - t) + 135 * u * t * t;
        const sway = Math.sin(now / 360 + i * 1.4) * 8 + g.tilt * e;
        const sc = 0.72 + 0.4 * Math.sin(Math.PI * t);
        const op = t <= 0 ? (i < 3 ? 0.72 : 0) : t > 0.78 ? 1 - (t - 0.78) / 0.22 : 1;
        garmentEl.style.opacity = op.toFixed(2);
        garmentEl.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${sway.toFixed(1)}deg) scale(${sc.toFixed(2)})`;
      });

      let findsOut = 0;
      for (let i = 0; i < N; i++) {
        const cardEl = cardRefs.current[i];
        const s = slots[i];
        if (!cardEl || !s) continue;

        const t = clamp((p - (first + i * step)) / dur);
        if (t >= 0.95) findsOut += 1;
        const e = clamp(easeOutBack(t), 0, 1.08);
        const fb = Math.sin((now / 1000) * 1.3 + i * 1.7) * 5 * cardU * e;
        const x = lerp(0, s.x * cardU - off, e);
        const y = lerp(-60 * cardU, s.y * cardU, e) - Math.sin(Math.PI * t) * 120 * cardU + fb;
        const rot = s.r + (1 - e) * (s.r >= 0 ? -25 : 25);
        const sc = 0.35 + 0.65 * e;
        cardEl.style.opacity = clamp(t * 3.5).toFixed(3);
        cardEl.style.pointerEvents = t >= 0.85 ? 'auto' : 'none';
        cardEl.tabIndex = t >= 0.85 ? 0 : -1;
        cardEl.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      }

      if (findsOut !== displayedFindCount) {
        displayedFindCount = findsOut;
        if (countRef.current) countRef.current.textContent = `${findsOut} of ${N} finds out`;
      }
      hudActionsRef.current?.classList.toggle('on', findsOut === N);

      const fo = (1 - clamp((p - 0.02) / 0.1)).toFixed(3);
      if (asideRef.current) asideRef.current.style.opacity = fo;
      if (taglineRef.current) taglineRef.current.style.opacity = fo;
      if (exploreBtnRef.current) exploreBtnRef.current.style.opacity = fo;
      if (copyRef.current) {
        copyRef.current.style.transform = `translateY(${shift ? (-12 * p).toFixed(1) : 0}px)`;
      }
    };

    frameRendererRef.current = (progress, now) => {
      sx += (ptx - sx) * 0.06;
      sy += (pty - sy) * 0.06;
      render(progress, now);
    };

    return () => {
      frameRendererRef.current = () => {};
      resizeObserver?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <section ref={heroRef} className="tc-hero" id="hero" aria-label="CircleUp — Fashion That Lasts">
      <div ref={stageRef} className="tc-stage">
        <div ref={copyRef} className="tc-copy">
          <span className="tc-kicker">
            <i aria-hidden="true" />
            Curated thrift, ready for another story
          </span>
          <h1>
            <span>Fashion That</span>
            {' '}
            <span>Lasts!</span>
          </h1>
          <p>
            Vintage, rentals and handmade finds, ready for a beautiful second life.
          </p>
          <Link ref={exploreBtnRef} className="tc-btn" to="/new-arrivals">
            Explore the edit
          </Link>
          <div ref={taglineRef} className="tc-tagline">
            A good find feels like fate.
            <svg aria-hidden="true" viewBox="0 0 280 26" className="tc-underline">
              <path d="M5 18C74 5 163 6 271 15M44 21C116 12 196 12 252 17" />
            </svg>
          </div>
        </div>

        <div ref={asideRef} className="tc-aside">
          <span className="tc-script">The next chapter looks good on you.</span>
          <figure className="tc-photo tc-photo-right">
            <img src={rtw4} alt="A vintage denim jumpsuit from the CircleUp collection" width={912} height={1200} loading="eager" decoding="async" />
          </figure>
        </div>

        <div className="tc-collage" role="group" aria-label="A collage of curated thrifted finds">
          <span aria-hidden className="tc-collage-blob" />
          <img className="tc-collage-photo tc-collage-one" src={rtw2} alt="Denim fit and flare co-ord set" width={912} height={1200} loading="eager" decoding="async" />
          <img className="tc-collage-photo tc-collage-two" src={bag1} alt="Textured handheld bag" width={1008} height={1008} loading="eager" decoding="async" />
          <img className="tc-collage-photo tc-collage-three" src={heroDetail1} alt="Top and skirt co-ord set" width={912} height={1200} loading="eager" decoding="async" />
        </div>

        <div
          ref={sceneRef}
          className="tc-scene"
          role="group"
          aria-label="Interactive treasure chest with curated finds"
        >
          <div className="tc-sun" />
          <div ref={shadowRef} className="tc-shadow" />
          <div ref={underglowRef} className="tc-underglow" />

          <ChestModel layer="back" backRigRef={backRigRef} lidRef={lidRef} />

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
                tabIndex={-1}
              >
                <span className="tc-tag">{item.tag}</span>
                <div
                  className="tc-ph"
                  style={{
                    background: `linear-gradient(160deg,${item.bg[0]},${item.bg[1]})`,
                  }}
                >
                  <img
                    src={item.img}
                    alt={item.name}
                    width={300}
                    height={390}
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div>
                  <span className="tc-nm">{item.name}</span>
                  <span className="tc-pr">{item.price}</span>
                </div>
              </Link>
            ))}
          </div>

          <ChestModel
            layer="front"
            frontRigRef={frontRigRef}
            frontFaceRef={frontFaceRef}
            sideFaceRef={sideFaceRef}
          />

          <div className="tc-hud">
            <span ref={countRef} className="tc-count">0 of 6 finds out</span>
            <div ref={hudActionsRef} className="tc-hud-actions">
              <Link className="tc-cta" to="/new-arrivals">
                See all six finds
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

