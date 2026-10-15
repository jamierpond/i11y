"use client";
import { PenroseScroll } from "./penrose";
import { HERO_PRELOAD, PenrosePhoto, focusCrop, heroSrc, usePenrosePhotos } from "./penrose-photos";
import { preload } from "react-dom";
import Image from "next/image";
import { motion } from "framer-motion";
import { Creepster, Tilt_Neon } from "next/font/google";
import { ProjectCard } from "./components/ProjectCard";
import { useEffect, useRef, useState } from "react";
import { useNearViewport } from "./components/useNearViewport";

// Poster theme: lime slime drip headline, hot-pink neon tube type, gold accents.
const drip = Creepster({ weight: "400", subsets: ["latin"] });
const neon = Tilt_Neon({ subsets: ["latin"] });
const LIME = "#c8f53a";
const PINK = "#ff4fd8";
const limeGlow = "0 0 6px rgba(200,245,58,0.9), 0 0 20px rgba(200,245,58,0.6), 0 0 45px rgba(140,220,20,0.45)";
const pinkGlow = "0 0 6px rgba(255,79,216,0.9), 0 0 18px rgba(255,79,216,0.6), 0 0 40px rgba(255,40,180,0.4)";

// Square tile cropped on the photo's focal point (same crop as the Penrose tiles).
function GalleryTile({ photo }: { photo: PenrosePhoto }) {
  const [pos, setPos] = useState("50% 50%");
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  if (!near) return <div ref={ref} className="w-full aspect-square rounded-lg bg-white/5" />;
  return (
    <Image
      src={photo.src}
      alt=""
      width={600}
      height={600}
      sizes="(min-width: 768px) 33vw, 50vw"
      className="w-full aspect-square object-cover rounded-lg"
      style={{ objectPosition: pos }}
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        const { sx, sy, s } = focusCrop(w, h, photo.focus);
        setPos(`${w > s ? (sx / (w - s)) * 100 : 50}% ${h > s ? (sy / (h - s)) * 100 : 50}%`);
      }}
    />
  );
}

// Hero badge: headline + tagline arched like the poster's rainbow lettering, over a
// round gold "disco porthole" (JOIN US) with a lime neon tube smiling under it (LEARN MORE).
// Everything shares one centre so the arcs read as concentric rings.
const GOLD = "#f2b84b";
const HX = 550; // arch centre in viewBox units
const HY = 600;
const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(HX + r * Math.sin(a)).toFixed(1)} ${(HY - r * Math.cos(a)).toFixed(1)}`;
};
// Arc over the top (text stands on it) and arc under the bottom (text hangs inside it).
const topArc = (r: number) => `M ${pt(r, -90)} A ${r} ${r} 0 0 1 ${pt(r, 90)}`;
const bottomArc = (r: number, from = 270, to = 90) => `M ${pt(r, from)} A ${r} ${r} 0 0 0 ${pt(r, to)}`;
const sector = (r0: number, r1: number, a0: number, a1: number) =>
  `M ${pt(r1, a0)} A ${r1} ${r1} 0 0 0 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 0 1 ${pt(r0, a0)} Z`;

const heroCss = `
.hero-cta { cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
.hero-cta .cta-body { transition: transform .18s ease; transform-box: fill-box; transform-origin: center; }
.hero-cta .tube { transition: stroke-width .18s ease, opacity .18s ease; }
.hero-cta .cta-fill { transition: fill .18s ease; }
.hero-cta .cta-label { transition: fill .18s ease; }
.hero-cta .focus-ring { opacity: 0; transition: opacity .15s; }
.hero-cta:focus-visible .focus-ring { opacity: 1; }
.hero-join:hover .tube { stroke-width: 11; }
.hero-join:hover .cta-fill { fill: rgba(255,79,216,0.22); }
.hero-join:hover .cta-label, .hero-learn:hover .cta-label { fill: #fff; }
.hero-join:active .cta-body { transform: scale(.94); }
.hero-learn:hover .tube { stroke-width: 13; }
.hero-learn:active .cta-body { transform: translateY(5px); }
@keyframes hero-flicker { 0%, 89%, 91%, 93.5%, 100% { opacity: 1 } 90% { opacity: .45 } 92.5% { opacity: .7 } }
@keyframes hero-hum { 0%, 100% { opacity: 1 } 50% { opacity: .82 } }
.hero-flicker { animation: hero-flicker 6.5s linear infinite; }
.hero-hum { animation: hero-hum 3.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hero-flicker, .hero-hum { animation: none; } }
`;

function HeroArch() {
  const scrollToAbout = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <svg
      viewBox="0 0 1100 990"
      className="block h-auto overflow-visible"
      style={{ width: "min(100%, 980px, calc((100svh - 120px) * 1.11))" }}
    >
      <style>{heroCss}</style>
      <defs>
        {/* Tight dark halo hugging the strokes so the photos behind stay visible, then the neon bloom. */}
        <filter id="hero-neon" x="-25%" y="-25%" width="150%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="fat" />
          <feGaussianBlur in="fat" stdDeviation="5" result="fatBlur" />
          <feFlood floodColor="#05030f" floodOpacity="0.8" />
          <feComposite in2="fatBlur" operator="in" result="halo" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="bloom" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="glow" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="bloom" />
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="hero-soft" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="hero-port" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#05030f" stopOpacity="0.15" />
          <stop offset="75%" stopColor="#05030f" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#05030f" stopOpacity="0.75" />
        </radialGradient>
        <path id="hero-arc-head" d={topArc(468)} />
        <path id="hero-arc-tag" d={topArc(366)} />
        <path id="hero-arc-learn" d={bottomArc(318)} />
      </defs>

      {/* Headline + tagline: the h1/p above carry the text for assistive tech. */}
      <g aria-hidden>
        <text
          filter="url(#hero-neon)"
          fill={LIME}
          fontSize="150"
          letterSpacing="3"
          style={{ fontFamily: drip.style.fontFamily }}
        >
          <textPath href="#hero-arc-head" startOffset="50%" textAnchor="middle">ILLUMINAUGHTY</textPath>
        </text>
        <text
          className="hero-hum"
          filter="url(#hero-neon)"
          fill={PINK}
          fontSize="56"
          letterSpacing="10"
          style={{ fontFamily: neon.style.fontFamily }}
        >
          <textPath href="#hero-arc-tag" startOffset="50%" textAnchor="middle">BLACK ROCK CITY</textPath>
        </text>

        {/* Doodles: a sparkle, a bolt, a ringed planet. */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#hero-soft)">
          <path
            d="M215 470 C219 492 224 497 246 501 C224 505 219 510 215 532 C211 510 206 505 184 501 C206 497 211 492 215 470 Z"
            stroke={PINK}
            strokeWidth="4"
          />
          <path d="M262 452 l0 14 M255 459 l14 0" stroke={GOLD} strokeWidth="3.5" />
          <path d="M880 455 L850 512 L876 510 L853 566 L905 496 L879 498 L900 455 Z" stroke={LIME} strokeWidth="4.5" />
          <g transform="rotate(-18 222 812)">
            <circle cx="222" cy="812" r="22" stroke={GOLD} strokeWidth="4" />
            <ellipse cx="222" cy="812" rx="44" ry="11" stroke={PINK} strokeWidth="3.5" strokeDasharray="0 0" />
          </g>
          <circle cx="890" cy="800" r="4" fill={GOLD} stroke="none" />
          <circle cx="913" cy="772" r="2.5" fill={PINK} stroke="none" />
        </g>
      </g>

      {/* JOIN US: the porthole. Gold mirror-tile ring around a pink neon tube. */}
      <a href="/camp-with-us" className="hero-cta hero-join" aria-label="Join us">
        <g className="cta-body">
          <circle cx={HX} cy={HY} r="236" fill="url(#hero-port)" />
          <circle className="cta-fill" cx={HX} cy={HY} r="214" fill="rgba(255,79,216,0.06)" />
          <g filter="url(#hero-soft)">
            <circle cx={HX} cy={HY} r="262" fill="none" stroke={GOLD} strokeWidth="2.5" opacity="0.7" />
            <circle cx={HX} cy={HY} r="247" fill="none" stroke={GOLD} strokeWidth="16" strokeDasharray="11 5" />
            <circle cx={HX} cy={HY} r="247" fill="none" stroke="#fff3c9" strokeWidth="16" strokeDasharray="11 37" opacity="0.55" />
            <circle cx={HX} cy={HY} r="232" fill="none" stroke={GOLD} strokeWidth="2.5" opacity="0.7" />
          </g>
          {/* Disco glints catching on the ring. */}
          <g fill="#fff8e1" filter="url(#hero-soft)">
            {[[-38, 1], [64, 0.7], [152, 0.85], [233, 0.6]].map(([deg, s]) => {
              const [x, y] = pt(247, deg).split(" ").map(Number);
              return (
                <path
                  key={deg}
                  transform={`translate(${x} ${y}) scale(${s})`}
                  d="M0 -26 C3 -6 6 -3 26 0 C6 3 3 6 0 26 C-3 6 -6 3 -26 0 C-6 -3 -3 -6 0 -26 Z"
                />
              );
            })}
          </g>
          <g className="hero-flicker" filter="url(#hero-neon)">
            <circle className="tube" cx={HX} cy={HY} r="208" fill="none" stroke={PINK} strokeWidth="8" />
            <circle cx={HX} cy={HY} r="208" fill="none" stroke="#ffd9f6" strokeWidth="2" />
          </g>
          <text
            className="cta-label"
            x={HX}
            y={HY + 28}
            textAnchor="middle"
            fill={PINK}
            fontSize="84"
            letterSpacing="6"
            filter="url(#hero-neon)"
            style={{ fontFamily: neon.style.fontFamily }}
          >
            JOIN US
          </text>
          <circle className="focus-ring" cx={HX} cy={HY} r="278" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
        </g>
      </a>

      {/* LEARN MORE: words hanging from a lime tube that smiles under the porthole. */}
      <a href="#about" onClick={scrollToAbout} className="hero-cta hero-learn" aria-label="Learn more">
        <path d={sector(260, 400, 220, 140)} fill="transparent" />
        <g className="cta-body">
          <text
            className="cta-label"
            fill={LIME}
            fontSize="46"
            letterSpacing="7"
            filter="url(#hero-neon)"
            style={{ fontFamily: neon.style.fontFamily }}
          >
            <textPath href="#hero-arc-learn" startOffset="50%" textAnchor="middle">LEARN MORE</textPath>
          </text>
          <g className="hero-hum" filter="url(#hero-neon)">
            <path className="tube" d={bottomArc(352, 216, 144)} fill="none" stroke={LIME} strokeWidth="9" strokeLinecap="round" />
            <path d={bottomArc(352, 216, 144)} fill="none" stroke="#f4ffd0" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <path className="focus-ring" d={sector(260, 400, 220, 140)} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
        </g>
      </a>
    </svg>
  );
}

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const photos = usePenrosePhotos();
  // The hero's first set, fetched with the page so it opens with photos showing.
  for (const p of photos.slice(0, HERO_PRELOAD)) {
    if (!p.noHero) preload(heroSrc(p.src), { as: "image", fetchPriority: "high" });
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="font-sans bg-[#1f1f1f]">
      <nav
        className="fixed top-0 left-0 right-0 z-50 p-4 pb-10 bg-gradient-to-b from-black/85 via-black/50 to-transparent"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)" }}
      >
        {/* Desktop Nav */}
        <div className="hidden md:flex justify-end space-x-8">
          <a href="#gallery" className="text-white hover:text-[#ff4fd8] transition-colors">Gallery</a>
          <a href="#camp" className="text-white hover:text-[#ff4fd8] transition-colors">Camp With Us</a>
          <a href="#contact" className="text-white hover:text-[#ff4fd8] transition-colors">Contact</a>
        </div>

        {/* Mobile Burger Button */}
        <div className="md:hidden flex justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-white p-2"
          >
            <div className="space-y-1">
              <div className="w-6 h-0.5 bg-white"></div>
              <div className="w-6 h-0.5 bg-white"></div>
              <div className="w-6 h-0.5 bg-white"></div>
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full right-4 bg-black bg-opacity-80 backdrop-blur-sm rounded-lg p-4 space-y-4">
            <a href="#gallery" className="block text-white hover:text-[#ff4fd8] transition-colors" onClick={() => setIsMenuOpen(false)}>Gallery</a>
            <a href="#camp" className="block text-white hover:text-[#ff4fd8] transition-colors" onClick={() => setIsMenuOpen(false)}>Camp With Us</a>
            <a href="#contact" className="block text-white hover:text-[#ff4fd8] transition-colors" onClick={() => setIsMenuOpen(false)}>Contact</a>
          </div>
        )}
      </nav>
      <section className="relative h-[100svh] min-h-[560px] overflow-hidden text-white bg-[#05030f]">
        <PenroseScroll />
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-1 pt-10 pb-12">
          <h1 className="sr-only">ILLUMINAUGHTY</h1>
          <p className="sr-only">Black Rock City</p>
          <motion.div
            className="w-full flex justify-center"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
          >
            <HeroArch />
          </motion.div>
        </div>
        <div
          className="absolute inset-x-0 z-10 flex justify-center pointer-events-none transition-opacity duration-500"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", opacity: scrolled ? 0 : 1 }}
        >
          <motion.button
            aria-label="Scroll to the next section"
            onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className={`p-3 text-white ${scrolled ? "" : "pointer-events-auto"}`}
            style={{ filter: 'drop-shadow(0 0 8px rgba(255,79,216,0.9)) drop-shadow(0 0 16px rgba(255,79,216,0.6))' }}
            tabIndex={scrolled ? -1 : 0}
          >
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none" aria-hidden>
              <path d="M2 2l12 12L26 2" stroke={PINK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>
      </section>
      <div className="relative bg-[#1f1f1f] text-white">
        <section id="about" className="px-6 py-16 md:py-24 max-w-3xl mx-auto">
          <h2 className={`text-2xl md:text-4xl mb-6 ${drip.className}`} style={{ color: LIME, textShadow: limeGlow }}>LOREM IPSUM DOLOR</h2>
          <p className="text-base md:text-lg text-white/80 mb-4">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </p>
          <p className="text-base md:text-lg text-white/80">
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          </p>
        </section>
        <section className="flex items-center justify-center p-4 py-12">
          <ProjectCard
            title="THE EYE OF PROVIDENCE"
            description="Behold a dazzling LED tower that pierces the twilight with its vibrant, ever-shifting colors. This magnificent structure, a beacon of artistry and innovation, casts a radiant glow upon the desert landscape, its light a mesmerizing dance of technology and imagination."
            imageSrc="/frontage.webp"
            imageAlt="The Eye of Providence"
          />
        </section>
        <section className="flex items-center justify-center p-4 py-12">
          <ProjectCard
            title="THE WALL"
            description="An enormous tessellation of vibrant Penrose tiles creates an impossibly infinite pattern that defies the eye. Each geometric facet catches and refracts light in brilliant hues of magenta, cyan, and gold, forming a mesmerizing wall of mathematical beauty that stretches beyond comprehension."
            imageSrc="/thewall.webp"
            imageAlt="The Wall - Penrose Tile Installation"
          />
        </section>
        <section id="gallery" className="px-4 py-12 max-w-6xl mx-auto">
          <h2 className={`text-2xl md:text-4xl mb-8 text-center ${drip.className}`} style={{ color: LIME, textShadow: limeGlow }}>THE CAMP</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
            {photos.map((p) => <GalleryTile key={p.src} photo={p} />)}
          </div>
        </section>
        <section className="flex items-center justify-center p-4 py-24">
          <motion.a
            href="/camp-with-us"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className={`text-xl md:text-3xl max-w-2xl text-center bg-black hover:bg-[#ff4fd8]/15 border-2 px-8 py-4 rounded-lg transition-colors cursor-pointer inline-block ${neon.className}`}
            style={{ color: PINK, borderColor: PINK, textShadow: pinkGlow, boxShadow: '0 0 14px rgba(255,79,216,0.5)' }}
          >
            JOIN US
          </motion.a>
        </section>
      </div>
    </div>
  );
}