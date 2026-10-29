import React from "react";

// Біт — a data-driven SVG rig. Every moving part has an explicit pivot in the
// 400×520 artwork space; the renderer only ever changes the pose numbers.

export type EyeMode = "open" | "happy" | "winkR" | "confused";

export interface CatPose {
  armL?: number; // deg, screen-left arm, 0 = hanging; + raises outward/up
  armR?: number; // deg, screen-right arm, 0 = hanging; + raises outward/up
  head?: number; // tilt deg
  tail?: number; // deg
  blink?: number; // 0 open … 1 closed
  eyes?: EyeMode;
  gazeX?: number; // -1 … 1
  gazeY?: number;
  mouth?: number; // 0 closed smile … 1 wide open
  brows?: number; // raise -1 … 1
  earL?: number;
  earR?: number;
  squash?: number; // 1 = neutral, <1 squashed, >1 stretched
  breathe?: number; // small scale offset
}

const GINGER = "#A1A1AA";
const GINGER_D = "#52525B";
const STRIPE = "#71717A";
const CREAM = "#FAFAFA";
const PINK = "#D4D4D8";
const INK = "#27272A";

const Eye: React.FC<{ cx: number; cy: number; mode: EyeMode; blink: number; gx: number; gy: number; right: boolean }> = ({
  cx,
  cy,
  mode,
  blink,
  gx,
  gy,
  right,
}) => {
  const closedArc = (
    <path
      d={`M ${cx - 26} ${cy + 4} Q ${cx} ${cy - 22} ${cx + 26} ${cy + 4}`}
      stroke={INK}
      strokeWidth={9}
      strokeLinecap="round"
      fill="none"
    />
  );
  if (mode === "happy" || (mode === "winkR" && right)) return closedArc;
  const sy = Math.max(0.06, 1 - blink);
  if (sy < 0.12) {
    return <path d={`M ${cx - 26} ${cy} L ${cx + 26} ${cy}`} stroke={INK} strokeWidth={8} strokeLinecap="round" />;
  }
  const confused = mode === "confused";
  const r = confused ? 15 : 22;
  return (
    <g transform={`translate(${cx} ${cy}) scale(1 ${sy}) translate(${-cx} ${-cy})`}>
      <ellipse cx={cx} cy={cy} rx={31} ry={37} fill="#fff" stroke={INK} strokeWidth={5} />
      <circle cx={cx + gx * 9} cy={cy + 4 + gy * 9} r={r} fill={INK} />
      <circle cx={cx + gx * 9 - 7} cy={cy - 6 + gy * 9} r={7.5} fill="#fff" />
      <circle cx={cx + gx * 9 + 7} cy={cy + 10 + gy * 9} r={3.5} fill="#fff" opacity={0.9} />
    </g>
  );
};

export const Cat: React.FC<{ pose: CatPose; style?: React.CSSProperties; width?: number }> = ({ pose, style, width = 400 }) => {
  const {
    armL = 0,
    armR = 0,
    head = 0,
    tail = 0,
    blink = 0,
    eyes = "open",
    gazeX = 0,
    gazeY = 0,
    mouth = 0,
    brows = 0,
    earL = 0,
    earR = 0,
    squash = 1,
    breathe = 0,
  } = pose;
  const sx = 1 / Math.sqrt(squash);
  const confused = eyes === "confused";
  const mo = Math.max(0, Math.min(1, mouth));

  const arm = (side: "L" | "R", deg: number) => {
    const px = side === "L" ? 128 : 272;
    const py = 356;
    const rot = side === "L" ? deg : -deg;
    return (
      <g transform={`rotate(${rot} ${px} ${py})`}>
        <rect x={px - 21} y={py - 14} width={42} height={98} rx={21} fill={GINGER} stroke={GINGER_D} strokeWidth={4} />
        <path d={`M ${px - 19} ${py + 30} h 38`} stroke={STRIPE} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
        <ellipse cx={px} cy={py + 82} rx={24} ry={20} fill={CREAM} stroke={GINGER_D} strokeWidth={4} />
        <path d={`M ${px - 8} ${py + 92} v -7 M ${px + 8} ${py + 92} v -7`} stroke={GINGER_D} strokeWidth={3} strokeLinecap="round" />
      </g>
    );
  };

  return (
    <svg viewBox="-40 -20 480 560" width={width * 1.2} style={{ overflow: "visible", ...style }}>
      {/* whole-body squash about the feet */}
      <g transform={`translate(200 510) scale(${sx * (1 + breathe)} ${squash * (1 - breathe * 0.5)}) translate(-200 -510)`}>
        {/* tail */}
        <g transform={`rotate(${tail} 292 470)`}>
          <path
            d="M 292 470 C 390 470 400 380 372 320 C 356 288 384 262 404 280"
            stroke={GINGER_D}
            strokeWidth={40}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 292 470 C 390 470 400 380 372 320 C 356 288 384 262 404 280"
            stroke={GINGER}
            strokeWidth={31}
            fill="none"
            strokeLinecap="round"
          />
          <path d="M 352 445 l 18 12 M 378 395 l 20 -2 M 368 336 l 20 -10" stroke={STRIPE} strokeWidth={7} strokeLinecap="round" />
          <circle cx={402} cy={280} r={15} fill={CREAM} />
        </g>
        {/* body */}
        <ellipse cx={200} cy={420} rx={108} ry={98} fill={GINGER} stroke={GINGER_D} strokeWidth={5} />
        <ellipse cx={200} cy={436} rx={64} ry={66} fill={CREAM} />
        <path d="M 108 400 q 18 6 26 20 M 292 400 q -18 6 -26 20" stroke={STRIPE} strokeWidth={7} strokeLinecap="round" fill="none" />
        {/* feet */}
        <ellipse cx={150} cy={505} rx={42} ry={23} fill={CREAM} stroke={GINGER_D} strokeWidth={4} />
        <ellipse cx={250} cy={505} rx={42} ry={23} fill={CREAM} stroke={GINGER_D} strokeWidth={4} />
        <path d="M 140 512 v -9 M 160 512 v -9 M 240 512 v -9 M 260 512 v -9" stroke={GINGER_D} strokeWidth={3} strokeLinecap="round" />
        {arm("L", armL)}
        {arm("R", armR)}
        {/* collar + tag */}
        <path d="M 120 326 Q 200 360 280 326" stroke="#52525B" strokeWidth={18} fill="none" strokeLinecap="round" />
        <circle cx={200} cy={356} r={22} fill="#F4F4F5" stroke="#3F3F46" strokeWidth={4} />
        <text x={200} y={364} textAnchor="middle" fontFamily="JetBrains Mono" fontWeight={800} fontSize={18} fill="#27272A">
          {"</>"}
        </text>
        {/* head */}
        <g transform={`rotate(${head} 200 320)`}>
          <g transform={`rotate(${earL} 112 140)`}>
            <path d="M 78 176 L 92 56 Q 96 44 106 52 L 170 118 Z" fill={GINGER} stroke={GINGER_D} strokeWidth={5} strokeLinejoin="round" />
            <path d="M 98 150 L 104 84 L 146 124 Z" fill={PINK} />
          </g>
          <g transform={`rotate(${earR} 288 140)`}>
            <path d="M 322 176 L 308 56 Q 304 44 294 52 L 230 118 Z" fill={GINGER} stroke={GINGER_D} strokeWidth={5} strokeLinejoin="round" />
            <path d="M 302 150 L 296 84 L 254 124 Z" fill={PINK} />
          </g>
          <ellipse cx={200} cy={222} rx={140} ry={114} fill={GINGER} stroke={GINGER_D} strokeWidth={5} />
          <path d="M 182 114 v 26 M 200 110 v 32 M 218 114 v 26" stroke={STRIPE} strokeWidth={8} strokeLinecap="round" />
          <path d="M 62 222 h 22 M 64 246 h 18 M 338 222 h -22 M 336 246 h -18" stroke={STRIPE} strokeWidth={7} strokeLinecap="round" />
          <ellipse cx={170} cy={278} rx={42} ry={32} fill={CREAM} />
          <ellipse cx={230} cy={278} rx={42} ry={32} fill={CREAM} />
          {/* blush */}
          <ellipse cx={104} cy={270} rx={24} ry={14} fill={PINK} opacity={0.75} />
          <ellipse cx={296} cy={270} rx={24} ry={14} fill={PINK} opacity={0.75} />
          {/* brows */}
          <path
            d={`M 122 ${176 - brows * 8 + (confused ? -6 : 0)} q 22 -10 44 ${confused ? 8 : 0}`}
            stroke={INK}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M 234 ${176 - brows * 8 + (confused ? 4 : 0)} q 22 ${confused ? -16 : -10} 44 ${confused ? -6 : 0}`}
            stroke={INK}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
          <Eye cx={146} cy={222} mode={eyes} blink={blink} gx={gazeX} gy={gazeY} right={false} />
          <Eye cx={254} cy={222} mode={eyes} blink={blink} gx={gazeX} gy={gazeY} right={true} />
          {/* nose */}
          <path d="M 188 256 Q 200 250 212 256 Q 206 268 200 270 Q 194 268 188 256 Z" fill="#52525B" stroke={INK} strokeWidth={3} />
          {/* mouth */}
          {mo < 0.08 ? (
            <path d="M 200 270 v 8 M 174 276 Q 186 292 200 278 Q 214 292 226 276" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
          ) : (
            <g>
              <path
                d={`M 176 ${276} Q 200 ${282 + 46 * mo} 224 ${276} Q 200 ${270} 176 ${276} Z`}
                fill="#3F3F46"
                stroke={INK}
                strokeWidth={5}
                strokeLinejoin="round"
              />
              <ellipse cx={200} cy={276 + 30 * mo} rx={12 + 4 * mo} ry={6 + 4 * mo} fill="#D4D4D8" />
            </g>
          )}
          {/* whiskers */}
          <g stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.55}>
            <path d="M 128 268 L 70 258 M 128 280 L 68 284 M 272 268 L 330 258 M 272 280 L 332 284" />
          </g>
        </g>
      </g>
    </svg>
  );
};
