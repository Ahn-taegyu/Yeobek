"use client";

import { useEffect, useRef } from "react";
import {
  AI_STAR_CENTER,
  AI_STAR_LIGHT,
  AI_STAR_LIGHT_BOX,
  AI_STAR_PIECES,
  AI_STAR_RADIUS,
  type AiStarBox,
  type AiStarPath,
} from "./pieces";

export type AiStarState = "idle" | "thinking";

type Props = {
  state?: AiStarState;
  size?: number | string;
  className?: string;
  /** Accessible name. Pass an empty string when the logo is decorative. */
  label?: string;
};

const IDLE = {
  /** Average orbit speed (deg/s). */
  speed: 26,
  /** One speed surge every N seconds; the lag between rings turns each surge into a swirl. */
  period: 7,
  /** Delay of the farthest stroke behind the center (s). */
  lag: 1.0,
};

const THINK = {
  /** Expand → spin + contract (s). */
  duration: 1.9,
  /** Fraction of the cycle spent spreading out before the spin. */
  expand: 0.32,
  /** Delay of the farthest stroke behind the center (s). */
  lag: 0.38,
};

/**
 * Outward travel at full spread, in units of the logo radius, by normalized distance r.
 * Travel is near-flat across rings so gaps open around the core as much as on the rim;
 * the center cell (r < core) stays anchored as the pivot dot and contracts slightly instead.
 */
const SPREAD = { core: 0.12, inner: 0.2, outer: 0.22, shrink: 0.12, coreShrink: 0.25 };

/** Light behind the swirl: the fourth-palest stroke yellow, so it reads as paint, not a glow. */
const CORE_LIGHT_COLOR = "#F8E948";

const VIEW_W = 171;
const VIEW_H = 155;
/** Canvas margin around the box (viewBox units) so spread strokes are not cut off. */
const OVERFLOW = 10;

/** Seconds of driver history kept; must exceed the largest lag. */
const HISTORY = 1.6;
const HISTORY_CAP = 512;

const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
const smoothstep = (a: number, b: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const { x: CX, y: CY } = AI_STAR_CENTER;

const PIECE_MOTION = AI_STAR_PIECES.map((piece) => {
  const rim = smoothstep(SPREAD.core * 0.5, SPREAD.core * 1.5, piece.r);
  const dist = piece.r || 1;
  return {
    lag: piece.r,
    shrink: SPREAD.coreShrink + (SPREAD.shrink - SPREAD.coreShrink) * rim,
    travel: AI_STAR_RADIUS * rim * (SPREAD.inner + (SPREAD.outer - SPREAD.inner) * piece.r),
    ux: piece.x / dist,
    uy: piece.y / dist,
    px: CX + piece.x * AI_STAR_RADIUS,
    py: CY + piece.y * AI_STAR_RADIUS,
  };
});

type Sprite = { image: CanvasImageSource; x: number; y: number; w: number; h: number };

/** Rasterize one piece once at `scale` device px per viewBox unit; frames only blit it. */
function makeSprite(box: AiStarBox, paths: readonly AiStarPath[], scale: number): Sprite | null {
  const [x0, y0, x1, y1] = box;
  const pad = 1 / scale; // one device pixel of antialiasing room
  const w = Math.max(1, Math.ceil((x1 - x0 + 2 * pad) * scale));
  const h = Math.max(1, Math.ceil((y1 - y0 + 2 * pad) * scale));
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, (pad - x0) * scale, (pad - y0) * scale);
  for (const path of paths) {
    ctx.fillStyle = path.fill;
    ctx.fill(new Path2D(path.d));
  }
  return { image: canvas, x: x0 - pad, y: y0 - pad, w: w / scale, h: h / scale };
}

export function AiStarLogo({ state = "idle", size = 48, className, label = "AI" }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !svg || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Layout: the SVG letterboxes the viewBox into the box; the canvas mirrors that plus an overflow margin.
    let unit = 0; // device px per viewBox unit
    let originX = 0; // device px of viewBox (0, 0) on the canvas
    let originY = 0;
    let lightSprite: Sprite | null = null;
    let sprites: (Sprite | null)[] = [];

    const layout = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (!width || !height) return false;
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(width / VIEW_W, height / VIEW_H);
      const margin = OVERFLOW * k;
      const nextUnit = k * dpr;
      canvas.style.left = `${-margin}px`;
      canvas.style.top = `${-margin}px`;
      canvas.style.width = `${width + 2 * margin}px`;
      canvas.style.height = `${height + 2 * margin}px`;
      canvas.width = Math.round((width + 2 * margin) * dpr);
      canvas.height = Math.round((height + 2 * margin) * dpr);
      originX = (margin + (width - VIEW_W * k) / 2) * dpr;
      originY = (margin + (height - VIEW_H * k) / 2) * dpr;
      if (nextUnit !== unit) {
        unit = nextUnit;
        lightSprite = makeSprite(AI_STAR_LIGHT_BOX, [{ d: AI_STAR_LIGHT, fill: CORE_LIGHT_COLOR }], unit);
        sprites = AI_STAR_PIECES.map((piece) => makeSprite(piece.box, piece.paths, unit));
      }
      return true;
    };

    // Driver history as parallel ring buffers: no per-frame allocation.
    const times = new Float64Array(HISTORY_CAP);
    const angles = new Float64Array(HISTORY_CAP);
    const spreads = new Float64Array(HISTORY_CAP);
    let head = 0; // index of the oldest sample
    let count = 0;

    let angle = 0;
    let spread = 0;
    let idleClock = 0;
    let lag = IDLE.lag;
    // Thinking cycle progress (0..1) or null while idling. A started cycle always finishes,
    // so switching back to idle never snaps the mark mid-spin.
    let cycle: number | null = null;
    let cycleStartAngle = 0;
    let last = performance.now() / 1000;
    let frame = 0;
    let visible = true;
    let ready = false;

    // Lagged driver state at time t, written into `out` to avoid allocating per piece.
    const out = { angle: 0, spread: 0 };
    const sampleAt = (t: number) => {
      const at = (i: number) => (head + i) % HISTORY_CAP;
      let lo = 0;
      let hi = count - 1;
      if (t <= times[at(lo)] || t >= times[at(hi)]) {
        const i = at(t <= times[at(lo)] ? lo : hi);
        out.angle = angles[i];
        out.spread = spreads[i];
        return out;
      }
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[at(mid)] <= t) lo = mid;
        else hi = mid;
      }
      const a = at(lo);
      const b = at(hi);
      const k = (t - times[a]) / (times[b] - times[a]);
      out.angle = angles[a] + (angles[b] - angles[a]) * k;
      out.spread = spreads[a] + (spreads[b] - spreads[a]) * k;
      return out;
    };

    /** Blit a sprite under: rotate(deg about the swirl center) · translate(tx, ty) · scale(s), all in viewBox units. */
    const blit = (sprite: Sprite | null, deg: number, tx: number, ty: number, s: number) => {
      if (!sprite) return;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const ox = tx - CX;
      const oy = ty - CY;
      const ex = cos * ox - sin * oy + CX;
      const ey = sin * ox + cos * oy + CY;
      ctx.setTransform(unit * s * cos, unit * s * sin, -unit * s * sin, unit * s * cos, originX + unit * ex, originY + unit * ey);
      ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h);
    };

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;

      if (cycle === null && stateRef.current === "thinking") {
        cycle = 0;
        cycleStartAngle = angle;
      }

      if (cycle !== null) {
        cycle += dt / THINK.duration;
        if (cycle >= 1) {
          angle = cycleStartAngle + 360;
          spread = 0;
          cycle = stateRef.current === "thinking" ? 0 : null;
          cycleStartAngle = angle;
          idleClock = 0;
        } else if (cycle < THINK.expand) {
          spread = easeOut(cycle / THINK.expand);
          angle = cycleStartAngle - 10 * Math.sin((Math.PI * cycle) / THINK.expand);
        } else {
          const p = easeInOut((cycle - THINK.expand) / (1 - THINK.expand));
          spread = 1 - p;
          angle = cycleStartAngle + 360 * p;
        }
      } else {
        idleClock += dt;
        // (1 - cos)^2 averages 1.5: long slow drift, then a pronounced surge.
        const surge = Math.pow(1 - Math.cos((2 * Math.PI * idleClock) / IDLE.period), 2) / 1.5;
        angle += IDLE.speed * surge * dt;
      }
      // Keep the angle bounded; whole turns are invisible.
      if (angle > 3600) {
        angle -= 3600;
        cycleStartAngle -= 3600;
        for (let i = 0; i < count; i += 1) angles[(head + i) % HISTORY_CAP] -= 3600;
      }

      // Ease the lag between modes so the trailing rings never jump.
      const targetLag = cycle === null ? IDLE.lag : THINK.lag;
      lag += (targetLag - lag) * Math.min(1, dt * 3);

      if (count === HISTORY_CAP) {
        head = (head + 1) % HISTORY_CAP;
        count -= 1;
      }
      const tail = (head + count) % HISTORY_CAP;
      times[tail] = now;
      angles[tail] = angle;
      spreads[tail] = spread;
      count += 1;
      while (count > 2 && times[(head + 1) % HISTORY_CAP] < now - HISTORY) {
        head = (head + 1) % HISTORY_CAP;
        count -= 1;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The core light sits at the pivot, so it turns with the leading (zero-lag) angle.
      blit(lightSprite, angle, 0, 0, 1);
      for (let n = 0; n < sprites.length; n += 1) {
        const m = PIECE_MOTION[n];
        const s = sampleAt(now - m.lag * lag);
        const push = m.travel * s.spread;
        const scale = 1 - s.spread * m.shrink;
        blit(sprites[n], s.angle, m.ux * push + m.px * (1 - scale), m.uy * push + m.py * (1 - scale), scale);
      }

      if (!ready) {
        // Swap in the canvas only once it has a full frame, so there is no blank flash.
        ready = true;
        canvas.style.display = "block";
        svg.style.visibility = "hidden";
      }
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const start = () => {
      if (!frame && visible && unit) {
        last = performance.now() / 1000;
        frame = requestAnimationFrame(tick);
      }
    };

    const resize = new ResizeObserver(() => {
      if (layout()) start();
    });
    resize.observe(wrap);

    // Stop the loop while the mark is scrolled out of view; resume without a time jump.
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    intersection.observe(wrap);

    if (layout()) start();
    return () => {
      resize.disconnect();
      intersection.disconnect();
      cancelAnimationFrame(frame);
      canvas.style.display = "none";
      svg.style.visibility = "";
    };
  }, []);

  const decorative = label === "";
  return (
    <span
      ref={wrapRef}
      className={className}
      style={{ position: "relative", display: "inline-block", width: size, height: size, lineHeight: 0 }}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      aria-busy={state === "thinking" || undefined}
    >
      {/* Static mark: first paint, server render and reduced motion. Hidden once the canvas animates. */}
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden>
        {AI_STAR_PIECES.map((piece, index) =>
          piece.paths.map((path, pathIndex) => <path key={`${index}-${pathIndex}`} d={path.d} fill={path.fill} />),
        )}
      </svg>
      <canvas ref={canvasRef} aria-hidden style={{ position: "absolute", display: "none", pointerEvents: "none" }} />
    </span>
  );
}
