import React from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { Cat, CatPose } from "./Cat";

// ----------------------------------------------------------------------------
// ATELIER — «Котик Біт» × informatic.website. Hand-authored, see art-direction.md.
// All timing comes from artifacts/timeline.json (built by build_audio.py), so the
// cat's mouth and the speech bubbles land on the synthesized syllables.
// ----------------------------------------------------------------------------

interface Syllable {
  t: number;
  reveal: number;
  pitch: number;
}
interface Line {
  id: string;
  kind: "talk" | "meow" | "purr";
  text: string;
  start: number;
  end: number;
  scene: string;
  syllables: Syllable[];
  mouth: { t: number; d: number }[];
}
interface Timeline {
  fps: number;
  duration: number;
  lines: Line[];
}
export interface SceneProps {
  timeline: Timeline;
}

// --- fonts (local woff2 from @fontsource/nunito, Cyrillic + Latin) -----------
const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD";
let fontsPromise: Promise<unknown> | null = null;
function loadFonts() {
  if (!fontsPromise) {
    const faces = (["800", "900"] as const).flatMap((w) => [
      new FontFace("Nunito", `url(${staticFile(`fonts/nunito-cyrillic-${w}-normal.woff2`)})`, { weight: w, unicodeRange: CYR }),
      new FontFace("Nunito", `url(${staticFile(`fonts/nunito-latin-${w}-normal.woff2`)})`, { weight: w, unicodeRange: LAT }),
    ]);
    fontsPromise = Promise.all(
      faces.map((f) =>
        f.load().then((l) => {
          document.fonts.add(l);
        }),
      ),
    );
  }
  return fontsPromise;
}
const useFonts = () => {
  const [handle] = React.useState(() => delayRender("nunito", { timeoutInMilliseconds: 60000 }));
  React.useEffect(() => {
    loadFonts()
      .then(() => continueRender(handle))
      .catch((e) => {
        console.error("font load failed", e);
        continueRender(handle);
      });
  }, [handle]);
};

const FONT = "Nunito, 'DejaVu Sans', sans-serif";
const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";
const C = {
  night: "#27272A",
  violet: "#3F3F46",
  lilac: "#D4D4D8",
  mint: "#F4F4F5",
  sunny: "#FFFFFF",
  coral: "#D4D4D8",
  ink: "#27272A",
};

// scene windows (seconds)
const SCENES = { s1: [0, 4.6], s2: [4.6, 10.5], s3: [10.5, 16.9], s4: [16.9, 23.0], s5: [23.0, 32.0] } as const;
const IRIS = 0.55;

// --- helpers ------------------------------------------------------------------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = Easing.bezier(0.34, 1.56, 0.64, 1); // overshoot
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const lerpT = (t: number, a: number, b: number, from: number, to: number, e = smooth) =>
  interpolate(t, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

const springAt = (t: number, start: number, fps: number, damping = 11, mass = 0.7) =>
  t < start ? 0 : spring({ frame: (t - start) * fps, fps, config: { damping, mass, stiffness: 150 } });

function mouthAt(t: number, lines: Line[]): number {
  let m = 0;
  for (const ln of lines) {
    if (t < ln.start - 0.1 || t > ln.end + 0.3) continue;
    for (const ev of ln.mouth) {
      const dt = t - ev.t;
      if (ln.kind === "meow") {
        if (dt >= 0 && dt <= ev.d) m = Math.max(m, Math.pow(Math.sin((Math.PI * dt) / ev.d), 0.5));
      } else if (dt >= 0 && dt <= 0.14) {
        m = Math.max(m, 0.75 * Math.sin((Math.PI * dt) / 0.14));
      }
    }
  }
  return m;
}

// procedural idle: breathing, tail sway, deterministic blinks, ear flicks
function idle(t: number, seed: number): CatPose {
  const period = 2.7 + random(`b${seed}`) * 0.8;
  const ph = (t + random(`o${seed}`) * 2) % period;
  const blink = ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
  const ep = (t + seed) % 3.9;
  return {
    blink,
    tail: 9 * Math.sin(t * 2.3 + seed),
    breathe: 0.012 * Math.sin(t * 3.1),
    earL: ep < 0.25 ? -10 * Math.sin((ep / 0.25) * Math.PI) : 0,
    earR: ep > 1.9 && ep < 2.15 ? 10 * Math.sin(((ep - 1.9) / 0.25) * Math.PI) : 0,
  };
}

// Cat placed by its feet (x, y in px) at a given width.
const PlacedCat: React.FC<{ x: number; y: number; w: number; pose: CatPose; rot?: number; shadow?: boolean }> = ({
  x,
  y,
  w,
  pose,
  rot = 0,
  shadow = true,
}) => {
  const u = w / 400;
  const svgW = w * 1.2;
  return (
    <>
      {shadow && (
        <div
          style={{
            position: "absolute",
            left: x - w * 0.42,
            top: y - w * 0.05,
            width: w * 0.84,
            height: w * 0.12,
            borderRadius: "50%",
            background: "rgba(24,24,27,0.28)",
            filter: "blur(6px)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: x - 240 * u,
          top: y - 530 * u,
          width: svgW,
          transform: `rotate(${rot}deg)`,
          transformOrigin: `${240 * u}px ${530 * u}px`,
        }}
      >
        <Cat pose={pose} width={w} />
      </div>
    </>
  );
};

// --- speech bubble --------------------------------------------------------------
const HL = /(informatic\.website|@informatic_it|Instagram|Біт)/g;

const Bubble: React.FC<{ line: Line; t: number; hideAt: number; top: number; tailX: number; size?: number }> = ({
  line,
  t,
  hideAt,
  top,
  tailX,
  size = 60,
}) => {
  const { fps } = useVideoConfig();
  if (t < line.start - 0.1 || t > hideAt + 0.17) return null;
  const pop = springAt(t, line.start - 0.1, fps, 9, 0.6);
  const out = lerpT(t, hideAt, hideAt + 0.16, 1, 0);
  const s = (0.55 + 0.45 * pop) * out;
  let shown = 0;
  for (const sy of line.syllables) if (t >= sy.t) shown = Math.max(shown, sy.reveal);
  const text = line.text;
  // split into highlight segments, then into visible/hidden parts (layout stays stable)
  const parts: { s: string; hl: boolean; from: number }[] = [];
  let last = 0;
  text.replace(HL, (m, _g, off: number) => {
    if (off > last) parts.push({ s: text.slice(last, off), hl: false, from: last });
    parts.push({ s: m, hl: true, from: off });
    last = off + m.length;
    return m;
  });
  if (last < text.length) parts.push({ s: text.slice(last), hl: false, from: last });

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        width: 960,
        top,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${s})`,
        transformOrigin: `${tailX - 60}px 100%`,
        opacity: out,
      }}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          border: `7px solid ${C.ink}`,
          borderRadius: 54,
          padding: "30px 46px 34px",
          boxShadow: `0 14px 0 ${C.ink}`,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.12,
          color: C.ink,
          textAlign: "center",
          maxWidth: 960,
        }}
      >
        {parts.map((p, i) => {
          const vis = clamp01((shown - p.from) / p.s.length) * p.s.length;
          const n = Math.max(0, Math.min(p.s.length, Math.round(vis)));
          return (
            <span key={i} style={{ color: p.hl ? C.violet : C.ink }}>
              {p.s.slice(0, n)}
              <span style={{ opacity: 0 }}>{p.s.slice(n)}</span>
            </span>
          );
        })}
        <svg
          width={70}
          height={60}
          viewBox="0 0 70 60"
          style={{ position: "absolute", bottom: -52, left: `calc(${((tailX - 60) / 960) * 100}% - 35px)`, overflow: "visible" }}
        >
          <path d="M 6 0 L 30 52 L 62 0 Z" fill="#fff" stroke={C.ink} strokeWidth={7} strokeLinejoin="round" />
          <rect x={0} y={-12} width={70} height={11} fill="#fff" />
        </svg>
      </div>
    </div>
  );
};

const SceneBubbles: React.FC<{ lines: Line[]; scene: string; t: number; top: number; tailX: number; size?: number }> = ({
  lines,
  scene,
  t,
  top,
  tailX,
  size,
}) => {
  const ls = lines.filter((l) => l.scene === scene);
  return (
    <>
      {ls.map((l, i) => {
        const next = ls[i + 1];
        const hideAt = next ? Math.min(next.start - 0.3, l.end + 1.2) : Math.min(l.end + 1.4, SCENES[scene as keyof typeof SCENES][1] - 0.2);
        return <Bubble key={l.id} line={l} t={t} hideAt={hideAt} top={top} tailX={tailX} size={size} />;
      })}
    </>
  );
};

// floating binary / pixel particles
const Particles: React.FC<{ t: number; n: number; color: string; seed: string; glyphs?: string[] }> = ({
  t,
  n,
  color,
  seed,
  glyphs = ["0", "1", "1", "0", "▪"],
}) => (
  <>
    {Array.from({ length: n }).map((_, i) => {
      const x = random(`${seed}x${i}`) * 1080;
      const sp = 30 + random(`${seed}s${i}`) * 60;
      const y = (((random(`${seed}y${i}`) * 2100 - t * sp) % 2100) + 2100) % 2100 - 100;
      const g = glyphs[Math.floor(random(`${seed}g${i}`) * glyphs.length)];
      const sz = 26 + random(`${seed}z${i}`) * 40;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: sz,
            color,
            opacity: 0.18 + random(`${seed}o${i}`) * 0.3,
          }}
        >
          {g}
        </div>
      );
    })}
  </>
);

const Cursor: React.FC<{ t: number; color: string; size: number }> = ({ t, color, size }) => (
  <span style={{ color, opacity: Math.floor(t * 2.2) % 2 === 0 ? 1 : 0, fontFamily: MONO, fontSize: size }}>▍</span>
);

// --- scene 1: laptop ----------------------------------------------------------
const Scene1: React.FC<{ t: number; lines: Line[] }> = ({ t, lines }) => {
  const { fps } = useVideoConfig();
  const rise = springAt(t, 0.25, fps, 8, 0.6);
  const dip = t < 0.25 ? lerpT(t, 0.05, 0.25, 0, 40) : 0;
  const feetY = 1420 + 760 * (1 - rise) + dip;
  const vel = t > 0.25 && t < 0.7 ? 1.14 : 1;
  const land = t > 0.7 ? 1 - 0.08 * Math.sin(clamp01((t - 0.7) / 0.25) * Math.PI) : vel;
  const wave = lerpT(t, 1.35, 1.6, 0, 1) * lerpT(t, 3.3, 3.6, 1, 0);
  const pose: CatPose = {
    ...idle(t, 1),
    squash: t < 0.25 ? 1 - dip / 300 : land,
    mouth: mouthAt(t, lines),
    armR: wave * (100 + 25 * Math.sin(t * 13)),
    armL: 0,
    head: wave * 6 * Math.sin(t * 6.5),
    gazeY: 0.15,
    eyes: t > 0.5 && t < 1.3 ? "happy" : "open",
  };
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, #52525B 0%, ${C.night} 62%)`, overflow: "hidden" }}>
      <Particles t={t} n={26} color={C.lilac} seed="s1" />
      {/* string of pixel lights */}
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 40 + i * 122,
            top: 70 + 26 * Math.sin((i / 8) * Math.PI),
            width: 26,
            height: 26,
            borderRadius: 6,
            background: [C.mint, C.sunny, C.coral][i % 3],
            boxShadow: `0 0 26px ${[C.mint, C.sunny, C.coral][i % 3]}`,
            opacity: 0.55 + 0.45 * Math.sin(t * 4 + i),
          }}
        />
      ))}
      <PlacedCat x={540} y={feetY} w={560} pose={pose} shadow={false} />
      {/* desk */}
      <div style={{ position: "absolute", left: 0, top: 1640, width: 1080, height: 280, background: "#3F3F46" }} />
      <div style={{ position: "absolute", left: 0, top: 1640, width: 1080, height: 16, background: "#71717A" }} />
      {/* laptop screen */}
      <div
        style={{
          position: "absolute",
          left: 190,
          top: 1180,
          width: 700,
          height: 430,
          borderRadius: 30,
          background: "#D4D4D8",
          padding: 22,
          boxSizing: "border-box",
          boxShadow: `0 0 120px rgba(255,255,255,${0.25 + 0.2 * rise})`,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 16,
            background: "#18181B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: 58,
            color: C.mint,
          }}
        >
          {">_ informatic".slice(0, Math.floor(lerpT(t, 0.9, 2.2, 0, 13, Easing.linear)))}
          <Cursor t={t} color={C.mint} size={58} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 1606,
          width: 860,
          height: 46,
          background: "#A1A1AA",
          clipPath: "polygon(6% 0, 94% 0, 100% 100%, 0 100%)",
          borderRadius: 8,
        }}
      />
      {/* mug */}
      <div style={{ position: "absolute", left: 900, top: 1530, width: 110, height: 120, borderRadius: "14px 14px 30px 30px", background: C.coral }} />
      <div style={{ position: "absolute", left: 990, top: 1555, width: 50, height: 60, borderRadius: 30, border: `14px solid ${C.coral}`, boxSizing: "border-box" }} />
      <div style={{ position: "absolute", left: 912, top: 1568, width: 86, textAlign: "center", fontFamily: MONO, fontWeight: 800, fontSize: 30, color: "#fff" }}>
        {"</>"}
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 930 + i * 36,
            top: 1460 - ((t * 60 + i * 40) % 80),
            width: 16,
            height: 46,
            borderRadius: 10,
            background: "rgba(255,255,255,0.35)",
            opacity: 1 - ((t * 60 + i * 40) % 80) / 80,
          }}
        />
      ))}
      {/* pop sparkles */}
      {Array.from({ length: 8 }).map((_, i) => {
        const p = clamp01((t - 0.45) / 0.6);
        if (p <= 0 || p >= 1) return null;
        const a = (i / 8) * Math.PI * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 540 + Math.cos(a) * 380 * p - 20,
              top: 980 + Math.sin(a) * 300 * p - 20,
              fontSize: 48,
              color: C.sunny,
              opacity: 1 - p,
              fontFamily: FONT,
            }}
          >
            ✦
          </div>
        );
      })}
      <SceneBubbles lines={lines} scene="s1" t={t} top={300} tailX={540} />
    </AbsoluteFill>
  );
};

// --- scene 2: swirl of scary symbols → stars ------------------------------------
const SYMBOLS = ["{ }", "</>", "0101", "if", "?", "#", "( )", "==", "for", "!="];

const Scene2: React.FC<{ t: number; lt: number; lines: Line[] }> = ({ t, lt, lines }) => {
  const JOY = 7.7;
  const joy = lerpT(t, JOY, JOY + 0.5, 0, 1);
  const thumbs = lerpT(t, 8.75, 9.05, 0, 1, ease);
  const pose: CatPose = {
    ...idle(t, 2),
    eyes: t < JOY ? "confused" : "happy",
    head: t < JOY ? -9 + 5 * Math.sin(t * 2.4) : 7 * Math.sin(t * 5),
    gazeX: Math.cos(lt * 1.3),
    gazeY: -0.3 + 0.3 * Math.sin(lt * 1.3),
    brows: t < JOY ? 0.6 : 1,
    armL: t < JOY ? lerpT(t, 4.9, 5.2, 0, 1) * (150 + 10 * Math.sin(t * 22)) : lerpT(t, JOY, JOY + 0.3, 150, 0),
    armR: thumbs * 120,
    mouth: mouthAt(t, lines),
    squash: 1 + 0.05 * Math.sin(clamp01((t - JOY) / 0.3) * Math.PI) * (t > JOY ? -1 : 0),
  };
  const bgA = interpolate(joy, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #3F3F46 0%, #27272A 100%)`, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          opacity: bgA,
          background: `repeating-conic-gradient(from ${t * 25}deg at 50% 52%, rgba(255,255,255,0.22) 0deg 10deg, rgba(0,0,0,0) 10deg 22deg), linear-gradient(180deg, #A1A1AA, #E4E4E7)`,
        }}
      />
      {/* orbiting symbols */}
      {SYMBOLS.map((s, i) => {
        const appear = springAt(t, 4.85 + i * 0.12, 30, 10, 0.5);
        const burstT = JOY - 0.1 + i * 0.07;
        const b = clamp01((t - burstT) / 0.25);
        const a = (i / SYMBOLS.length) * Math.PI * 2 + lt * 1.3 * (i % 2 ? 1 : 0.8);
        const rx = 410,
          ry = 330;
        const x = 540 + Math.cos(a) * rx;
        const y = 960 + Math.sin(a) * ry;
        const star = t >= burstT + 0.12;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - (star ? (t - burstT) * 40 : 0),
              transform: `translate(-50%,-50%) scale(${appear * (star ? 1 + 0.15 * Math.sin(t * 6 + i) : 1 + b * 0.7)}) rotate(${Math.sin(lt * 2 + i) * 14}deg)`,
              fontFamily: star ? FONT : MONO,
              fontWeight: 900,
              fontSize: star ? 92 : 74,
              color: star ? (i % 2 ? C.sunny : C.coral) : "#F4F4F5",
              opacity: star ? 1 : 1 - b,
              textShadow: star ? "0 0 30px rgba(255,255,255,0.8)" : "0 6px 0 rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            {star ? (i % 2 ? "★" : "♥") : s}
          </div>
        );
      })}
      {/* sweat drop while confused */}
      {t < JOY && (
        <div
          style={{
            position: "absolute",
            left: 800,
            top: 700 + ((lt * 50) % 40),
            width: 34,
            height: 50,
            background: "#E4E4E7",
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            opacity: lerpT(t, 5.2, 5.5, 0, 0.9),
          }}
        />
      )}
      <PlacedCat x={540} y={1560} w={760} pose={pose} />
      <SceneBubbles lines={lines} scene="s2" t={t} top={190} tailX={540} />
    </AbsoluteFill>
  );
};

// --- scene 3: the website on a phone -----------------------------------------------
const CARDS = [
  { icon: "📚", title: "Уроки", sub: "теорія простими словами", col: C.violet, at: 12.2 },
  { icon: "✅", title: "Тести", sub: "перевір себе", col: "#52525B", at: 13.0 },
  { icon: "💻", title: "Задачі", sub: "програмування на практиці", col: "#71717A", at: 13.8 },
];

const Scene3: React.FC<{ t: number; lt: number; lines: Line[] }> = ({ t, lt, lines }) => {
  const { fps } = useVideoConfig();
  const ph = springAt(lt, 0.05, fps, 13, 0.8);
  const url = "informatic.website";
  const typed = url.slice(0, Math.floor(lerpT(t, 11.3, 12.0, 0, url.length, Easing.linear)));
  const catIn = springAt(lt, 0.5, fps, 10, 0.6);
  const lastCard = CARDS.reduce((acc, c) => (t >= c.at ? c.at : acc), 0);
  const bob = lastCard ? 0.9 * Math.exp(-(t - lastCard) * 6) * Math.sin((t - lastCard) * 25) : 0;
  const pose: CatPose = {
    ...idle(t, 3),
    armR: lerpT(lt, 0.7, 1.0, 0, 1, ease) * (112 + 6 * Math.sin(t * 4)),
    gazeX: 0.8,
    gazeY: -0.7,
    head: 8 + bob * 8,
    mouth: mouthAt(t, lines),
    eyes: lastCard >= 13.8 && t > 14.3 ? "happy" : "open",
  };
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #FAFAFA 0%, #D4D4D8 100%)",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(82,82,91,0.18) 4px, transparent 4px)",
          backgroundSize: "54px 54px",
          backgroundPosition: `0 ${-lt * 30}px`,
        }}
      />
      {/* phone */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 470 + (1 - ph) * 1500,
          width: 780,
          height: 1290,
          borderRadius: 78,
          background: C.night,
          padding: 24,
          boxSizing: "border-box",
          transform: `rotate(${(1 - ph) * -8}deg)`,
          boxShadow: "0 40px 80px rgba(24,24,27,0.35)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 56, background: "#fff", overflow: "hidden", position: "relative" }}>
          {/* address bar */}
          <div
            style={{
              margin: "56px 30px 0",
              height: 86,
              borderRadius: 43,
              background: "#F4F4F5",
              display: "flex",
              alignItems: "center",
              padding: "0 30px",
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 42,
              color: C.ink,
              gap: 16,
            }}
          >
            <span style={{ fontSize: 34, filter: "grayscale(1)" }}>🔒</span>
            <span>{typed}</span>
            <Cursor t={t} color={C.violet} size={42} />
          </div>
          {/* hero banner */}
          <div
            style={{
              margin: "28px 30px 0",
              height: 280,
              borderRadius: 40,
              background: `linear-gradient(135deg, ${C.violet}, #27272A)`,
              color: "#fff",
              fontFamily: FONT,
              fontWeight: 900,
              padding: "40px 40px",
              boxSizing: "border-box",
              transform: `scale(${lerpT(t, 11.9, 12.2, 0.8, 1, ease)})`,
              opacity: lerpT(t, 11.9, 12.1, 0, 1),
            }}
          >
            <div style={{ fontSize: 76, lineHeight: 1 }}>informatic</div>
            <div style={{ fontSize: 44, marginTop: 18, color: "#E4E4E7" }}>Інформатика — це цікаво!</div>
          </div>
          {CARDS.map((c, i) => {
            const p = springAt(t, c.at, fps, 9, 0.55);
            return (
              <div
                key={i}
                style={{
                  margin: "26px 30px 0",
                  height: 150,
                  borderRadius: 36,
                  background: "#fff",
                  border: `6px solid ${c.col}`,
                  boxShadow: `0 10px 0 ${c.col}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                  padding: "0 30px",
                  transform: `scale(${p}) rotate(${(1 - p) * (i % 2 ? 6 : -6)}deg)`,
                  opacity: p > 0.02 ? 1 : 0,
                }}
              >
                <div style={{ fontSize: 80, filter: "grayscale(1)" }}>{c.icon}</div>
                <div style={{ fontFamily: FONT }}>
                  <div style={{ fontWeight: 900, fontSize: 58, color: c.col, lineHeight: 1 }}>{c.title}</div>
                  <div style={{ fontWeight: 800, fontSize: 32, color: "#71717A", marginTop: 6 }}>{c.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <PlacedCat x={235} y={2010 + (1 - catIn) * 600} w={430} pose={pose} rot={6} shadow={false} />
      <SceneBubbles lines={lines} scene="s3" t={t} top={70} tailX={300} size={54} />
    </AbsoluteFill>
  );
};

// --- scene 4: staircase + first code --------------------------------------------
const STEPS = [
  { x: 220, top: 1640, col: "#3F3F46", side: "#27272A" },
  { x: 460, top: 1460, col: "#71717A", side: "#52525B" },
  { x: 700, top: 1280, col: "#A1A1AA", side: "#71717A" },
];
const SPOTS = [
  [110, 1880],
  [340, 1640],
  [580, 1460],
  [820, 1280],
];
const JUMPS = [17.6, 18.4, 19.2];
const JD = 0.45;

const Scene4: React.FC<{ t: number; lt: number; lines: Line[] }> = ({ t, lt, lines }) => {
  const { fps } = useVideoConfig();
  let x = SPOTS[0][0],
    y = SPOTS[0][1],
    squash = 1;
  for (let i = 0; i < JUMPS.length; i++) {
    const j0 = JUMPS[i];
    if (t >= j0 + JD) {
      x = SPOTS[i + 1][0];
      y = SPOTS[i + 1][1];
      const since = t - (j0 + JD);
      if (since < 0.3) squash = 1 - 0.16 * Math.sin((since / 0.3) * Math.PI) * Math.exp(-since * 4);
    } else if (t >= j0) {
      const p = (t - j0) / JD;
      x = interpolate(p, [0, 1], [SPOTS[i][0], SPOTS[i + 1][0]]);
      y = interpolate(p, [0, 1], [SPOTS[i][1], SPOTS[i + 1][1]]) - 230 * Math.sin(p * Math.PI);
      squash = 1.12 - 0.12 * Math.abs(p - 0.5) * 2;
      break;
    } else if (t > j0 - 0.12) {
      squash = 1 - 0.14 * Math.sin(((t - (j0 - 0.12)) / 0.12) * (Math.PI / 2));
      break;
    } else break;
  }
  const TADA = 21.4;
  const cheer = lerpT(t, TADA - 0.05, TADA + 0.2, 0, 1, ease);
  const jumping = JUMPS.some((j) => t >= j && t < j + JD);
  const pose: CatPose = {
    ...idle(t, 4),
    squash: t > TADA && t < TADA + 0.4 ? 1 - 0.1 * Math.sin(((t - TADA) / 0.4) * Math.PI) : squash,
    armL: jumping ? 70 : cheer * (130 + 12 * Math.sin(t * 12)),
    armR: jumping ? 70 : cheer * (130 + 12 * Math.sin(t * 12 + 1)),
    eyes: t > TADA ? "happy" : jumping ? "happy" : "open",
    gazeX: t > 19.7 && t < TADA ? -0.6 : 0.3,
    gazeY: t > 19.7 && t < TADA ? -0.9 : -0.2,
    mouth: Math.max(mouthAt(t, lines), t > TADA && t < TADA + 0.7 ? 0.6 : 0),
  };
  const code = 'print("Привіт, світ!")';
  const nType = Math.floor(lerpT(t, 19.8, 21.0, 0, code.length, Easing.linear));
  const win = springAt(t, 19.55, fps, 12, 0.6);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)", overflow: "hidden" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: ((i * 420 + lt * 40) % 1400) - 260,
            top: 980 + i * 120,
            width: 260,
            height: 90,
            borderRadius: 60,
            background: "rgba(255,255,255,0.7)",
          }}
        />
      ))}
      {/* code window */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 450,
          width: 900,
          height: 360,
          borderRadius: 40,
          background: "#18181B",
          border: `7px solid ${C.ink}`,
          boxShadow: `0 14px 0 ${C.ink}`,
          transform: `scale(${win})`,
          opacity: win > 0.02 ? 1 : 0,
          padding: "0 44px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: 16, padding: "26px 0 20px" }}>
          {[C.coral, C.sunny, C.mint].map((c) => (
            <div key={c} style={{ width: 28, height: 28, borderRadius: 14, background: c }} />
          ))}
          <div style={{ marginLeft: 20, fontFamily: FONT, fontWeight: 800, fontSize: 30, color: "#A1A1AA" }}>main.py</div>
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 50, color: "#E4E4E7", whiteSpace: "pre" }}>
          <span style={{ color: "#D4D4D8" }}>{code.slice(0, Math.min(nType, 5))}</span>
          <span style={{ color: "#E4E4E7" }}>{code.slice(5, nType)}</span>
          {t < TADA && <Cursor t={t} color={C.mint} size={50} />}
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 50, color: C.mint, marginTop: 24, opacity: lerpT(t, TADA - 0.1, TADA + 0.1, 0, 1) }}>
          {"> Привіт, світ! "}
          {t >= TADA && <Cursor t={t} color={C.mint} size={50} />}
        </div>
      </div>
      {/* ✓ badge */}
      <div
        style={{
          position: "absolute",
          left: 870,
          top: 390,
          width: 130,
          height: 130,
          borderRadius: 65,
          background: C.mint,
          border: `7px solid ${C.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 80,
          color: C.ink,
          transform: `scale(${springAt(t, TADA, fps, 8, 0.5)}) rotate(${(1 - cheer) * -40}deg)`,
        }}
      >
        ✓
      </div>
      {/* steps */}
      {STEPS.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{ position: "absolute", left: s.x, top: s.top, width: 240, height: 1920 - s.top, background: s.col, borderTop: `16px solid ${s.side}` }} />
          <div
            style={{
              position: "absolute",
              left: s.x,
              top: s.top + 40,
              width: 240,
              textAlign: "center",
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 110,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {i + 1}
          </div>
        </React.Fragment>
      ))}
      <div style={{ position: "absolute", left: 0, top: 1880, width: 220, height: 40, background: "#3F3F46" }} />
      <PlacedCat x={x} y={y} w={300} pose={pose} />
      {/* confetti */}
      {t > TADA &&
        Array.from({ length: 64 }).map((_, i) => {
          const dt = t - TADA;
          const a = random(`ca${i}`) * Math.PI - Math.PI;
          const v = 700 + random(`cv${i}`) * 900;
          const cx = 820 + Math.cos(a) * v * dt;
          const cy = 1150 + Math.sin(a) * v * dt + 1300 * dt * dt;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cx,
                top: cy,
                width: 22,
                height: 34,
                borderRadius: 5,
                background: [C.violet, C.mint, C.coral, C.sunny, "#71717A"][i % 5],
                transform: `rotate(${dt * 600 * (random(`cr${i}`) - 0.5)}deg)`,
              }}
            />
          );
        })}
      <SceneBubbles lines={lines} scene="s4" t={t} top={120} tailX={540} />
    </AbsoluteFill>
  );
};

// --- scene 5: call to action ---------------------------------------------------------
const Scene5: React.FC<{ t: number; lt: number; lines: Line[] }> = ({ t, lt, lines }) => {
  const { fps } = useVideoConfig();
  const jumpIn = springAt(lt, 0.15, fps, 9, 0.7);
  const MEOW = 28.9;
  const point = lerpT(t, 25.3, 25.6, 0, 1, ease) * lerpT(t, 28.3, 28.7, 1, 0);
  const pose: CatPose = {
    ...idle(t, 5),
    armR: lerpT(lt, 0.5, 0.8, 0, 1) * (112 + 22 * Math.sin(t * 12)),
    armL: point * 40 + lerpT(t, 28.6, 28.9, 0, 1) * (125 + 18 * Math.sin(t * 12 + 2)),
    eyes: t > MEOW - 0.05 && t < MEOW + 1.6 ? "winkR" : "open",
    gazeY: point ? 0.8 : 0.1,
    gazeX: point ? -0.3 : 0,
    head: 6 * Math.sin(t * 3),
    mouth: mouthAt(t, lines),
    squash: 1 + (1 - jumpIn) * 0.15,
  };
  const pill = springAt(t, 23.6, fps, 9, 0.6);
  const ig = springAt(t, 25.4, fps, 9, 0.6);
  const pulse = 1 + 0.05 * Math.sin(t * 8) * lerpT(t, 26, 26.3, 0, 1);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, #A1A1AA 0%, #71717A 55%, ${C.night} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${t * 18}deg at 50% 42%, rgba(255,255,255,0.08) 0deg 12deg, rgba(0,0,0,0) 12deg 24deg)`,
        }}
      />
      <Particles t={t} n={18} color="#fff" seed="s5" glyphs={["✦", "·", "1", "0"]} />
      <PlacedCat x={540} y={1215 + (1 - jumpIn) * 900} w={540} pose={pose} />
      {/* URL pill */}
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 1290,
          width: 940,
          height: 140,
          borderRadius: 70,
          background: "#fff",
          border: `7px solid ${C.ink}`,
          boxShadow: `0 12px 0 ${C.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 76,
          color: C.violet,
          transform: `scale(${pill})`,
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontSize: 62, filter: "grayscale(1)" }}>🌐</span> informatic.website
      </div>
      {/* Instagram card */}
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 1480,
          width: 940,
          height: 290,
          borderRadius: 54,
          background: "linear-gradient(120deg, #71717A 0%, #3F3F46 45%, #52525B 75%, #27272A 100%)",
          border: `7px solid ${C.ink}`,
          boxShadow: `0 12px 0 ${C.ink}`,
          display: "flex",
          alignItems: "center",
          padding: "0 44px",
          gap: 36,
          transform: `scale(${ig})`,
          boxSizing: "border-box",
        }}
      >
        <svg width={150} height={150} viewBox="0 0 100 100">
          <rect x={8} y={8} width={84} height={84} rx={26} fill="none" stroke="#fff" strokeWidth={9} />
          <circle cx={50} cy={50} r={19} fill="none" stroke="#fff" strokeWidth={9} />
          <circle cx={73} cy={27} r={6} fill="#fff" />
        </svg>
        <div style={{ fontFamily: FONT, color: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 70, lineHeight: 1 }}>@informatic_it</div>
          <div
            style={{
              display: "inline-block",
              marginTop: 22,
              padding: "12px 36px",
              borderRadius: 40,
              background: "#fff",
              color: "#3F3F46",
              fontWeight: 900,
              fontSize: 44,
              transform: `scale(${pulse})`,
            }}
          >
            Підписуйся! ❤
          </div>
        </div>
      </div>
      {/* hearts after the final meow */}
      {t > MEOW &&
        Array.from({ length: 12 }).map((_, i) => {
          const dt = t - MEOW - i * 0.08;
          if (dt < 0) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 540 + (random(`hx${i}`) - 0.5) * 700 + Math.sin(dt * 3 + i) * 30,
                top: 640 - dt * (260 + random(`hv${i}`) * 200),
                fontSize: 50 + random(`hs${i}`) * 40,
                color: i % 2 ? C.coral : "#52525B",
                opacity: clamp01(1.6 - dt * 0.6),
                fontFamily: FONT,
              }}
            >
              ♥
            </div>
          );
        })}
      <SceneBubbles lines={lines} scene="s5" t={t} top={110} tailX={540} />
    </AbsoluteFill>
  );
};

// --- iris transition wrapper ---------------------------------------------------------
const Iris: React.FC<{ lt: number; cx: number; cy: number; children: React.ReactNode }> = ({ lt, cx, cy, children }) => {
  const r = lerpT(lt, 0, IRIS, 0, 2300);
  const done = lt >= IRIS;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: done ? undefined : `circle(${r}px at ${cx}px ${cy}px)` }}>{children}</AbsoluteFill>
      {!done && (
        <div
          style={{
            position: "absolute",
            left: cx - r,
            top: cy - r,
            width: 2 * r,
            height: 2 * r,
            borderRadius: "50%",
            border: `26px solid #FFFFFF`,
            boxSizing: "border-box",
            boxShadow: `0 0 0 10px ${C.ink}`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = ({ timeline }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = timeline.lines;
  const on = (k: keyof typeof SCENES) => t >= SCENES[k][0] && t < (k === "s5" ? 99 : SCENES[nextOf(k)][0] + IRIS);
  const lt = (k: keyof typeof SCENES) => t - SCENES[k][0];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {on("s1") && <Scene1 t={t} lines={lines} />}
      {on("s2") && (
        <Iris lt={lt("s2")} cx={540} cy={980}>
          <Scene2 t={t} lt={lt("s2")} lines={lines} />
        </Iris>
      )}
      {on("s3") && (
        <Iris lt={lt("s3")} cx={540} cy={1000}>
          <Scene3 t={t} lt={lt("s3")} lines={lines} />
        </Iris>
      )}
      {on("s4") && (
        <Iris lt={lt("s4")} cx={235} cy={1800}>
          <Scene4 t={t} lt={lt("s4")} lines={lines} />
        </Iris>
      )}
      {on("s5") && (
        <Iris lt={lt("s5")} cx={820} cy={1150}>
          <Scene5 t={t} lt={lt("s5")} lines={lines} />
        </Iris>
      )}
      <Audio src={staticFile("mix.wav")} />
    </AbsoluteFill>
  );
};

function nextOf(k: keyof typeof SCENES): keyof typeof SCENES {
  const order: (keyof typeof SCENES)[] = ["s1", "s2", "s3", "s4", "s5"];
  return order[Math.min(order.length - 1, order.indexOf(k) + 1)];
}

export const calculateMetadata: CalculateMetadataFunction<SceneProps> = async ({ props }) => ({
  durationInFrames: Math.ceil((props.timeline?.duration ?? 32) * 30),
  fps: 30,
  width: 1080,
  height: 1920,
});
