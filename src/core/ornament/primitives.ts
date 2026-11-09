/**
 * Building blocks for carved relief.
 *
 * Every primitive is a height field: give it a point in millimetres and it
 * returns a height, never negative, that is zero outside its own footprint.
 * Ornament is composed by taking the maximum of overlapping primitives, which
 * is what carving does — whatever stands proudest wins — and keeps the result
 * a single-valued surface that prints without supports.
 */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const TAU = Math.PI * 2

/**
 * Rounded cap: 1 on the centre line, falling to 0 at `dist = r`. Steeper than
 * a cosine near the rim, which reads as an undercut edge once lit, but with a
 * small flat foot so the rim does not alias into a stair-step on the grid.
 */
export function cap(dist: number, r: number): number {
  if (r <= 0 || dist >= r) return 0
  const x = dist / r
  return Math.sqrt(1 - x * x) * smoothstep(1, 0.88, x) + (1 - x) * 0.08
}

/** A hemispherical boss. */
export const dome = (px: number, py: number, cx: number, cy: number, r: number) =>
  cap(Math.hypot(px - cx, py - cy), r)

/** An ellipsoidal boss, axis-aligned. */
export function ellipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (px - cx) / rx
  const dy = (py - cy) / ry
  return cap(Math.sqrt(dx * dx + dy * dy), 1)
}

/**
 * A volute — the rolled end of a scroll.
 *
 * An Archimedean spiral ribbon starting at `start` (radians) on the outer
 * radius `R` and winding inward `turns` times to an eye of radius `eye`.
 * `hand` +1 winds counter-clockwise, −1 clockwise. The ribbon rises toward the
 * eye, and a low web fills between its turns so the scroll reads as one solid
 * roll rather than a coiled wire.
 */
export function volute(
  px: number, py: number,
  cx: number, cy: number,
  R: number, eye: number, turns: number,
  start: number, hand: 1 | -1,
  hOuter: number, hInner: number,
): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho > R * 1.25) return 0

  const total = TAU * turns
  const b = (R - eye) / total
  const half = Math.max(0.45, 0.3 * TAU * b)
  const alpha = Math.atan2(dy, dx)
  let theta0 = (hand * (alpha - start)) % TAU
  if (theta0 < 0) theta0 += TAU

  let best = 0
  for (let k = 0; k <= Math.ceil(turns) + 1; k++) {
    const theta = theta0 + TAU * k
    if (theta > total) break
    const r = R - b * theta
    const d = Math.abs(rho - r)
    if (d >= half) continue
    const f = theta / total
    const h = (hOuter + (hInner - hOuter) * f) * cap(d, half)
    if (h > best) best = h
  }
  // Web between the turns, and the boss in the eye.
  const web = 0.32 * hOuter * cap(rho, R * 0.98)
  const boss = hInner * 1.08 * cap(rho, eye * 1.6)
  return Math.max(best, web, boss)
}

/** A rounded lobe that rises slowly and falls quickly, so it points forward. */
const tooth = (phase: number) =>
  phase < 0.65 ? Math.sin((Math.PI / 2) * (phase / 0.65)) : Math.cos((Math.PI / 2) * ((phase - 0.65) / 0.35))

const fract = (x: number) => x - Math.floor(x)

export interface LeafShape {
  /** Length from base to tip (mm). */
  length: number
  /** Half-width at the widest point (mm). */
  half: number
  /** Number of lobes down each side. */
  lobes: number
  /**
   * How far the leaf's axis bends sideways by the tip, as a fraction of its
   * length. Positive bends to the left of the direction of growth.
   */
  curl: number
  /** Peak height (mm). */
  height: number
}

/**
 * An acanthus leaf: a blade with rounded, forward-pointing lobes, a groove
 * running back from every notch to the midrib, and a proud midrib that ends in
 * a turned-over tip.
 *
 * The leaf stands on a plateau so its outline is a cut edge, and each lobe is
 * its own little pillow between two grooves; that is what makes it read as
 * carved rather than embossed.
 */
export function leaf(
  px: number, py: number,
  bx: number, by: number,
  angle: number,
  shape: LeafShape,
): number {
  const rx = px - bx
  const ry = py - by
  const reach = shape.length + shape.half
  if (rx > reach || rx < -reach || ry > reach || ry < -reach) return 0
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const x = rx * c + ry * s
  if (x <= 0 || x >= shape.length) return 0
  const xn = x / shape.length
  const y = -rx * s + ry * c - shape.curl * shape.length * xn * xn

  const envelope = Math.pow(Math.sin(Math.PI * Math.pow(xn, 0.62)), 0.55)
  const ay = Math.abs(y)
  if (ay >= shape.half * envelope) return 0
  // Lobes lean forward: further from the midrib, the outline lags behind.
  const lag = 0.7 * (ay / shape.half)
  const q = xn * shape.lobes - lag
  const w = shape.half * envelope * (0.5 + 0.5 * tooth(fract(q)))
  if (w <= 0.3) return 0
  const r = ay / w
  if (r >= 1) return 0

  const pillow = Math.pow(Math.abs(Math.sin(Math.PI * q)), 0.55)
  const lobed = 1 - (1 - pillow) * smoothstep(0.12, 0.5, r)
  const body = Math.sqrt(1 - r * r)
  const rib = Math.exp(-((ay / Math.max(0.5, shape.half * 0.13)) ** 2))
  const profile = 0.36 + 0.42 * body * (0.55 + 0.45 * lobed) + 0.26 * rib
  // Rises from the base, and lifts again where the tip turns over.
  const along = 0.74 + 0.16 * Math.sin(Math.PI * xn) + 0.2 * smoothstep(0.72, 0.97, xn)
  return shape.height * Math.min(1, profile * along) * smoothstep(0, 0.05, xn)
}

/**
 * A scroll of foliage: a spiral stalk clothed down its outer side in acanthus
 * lobes that lean the way the stalk is growing, coiling inward to a turned
 * tip. `R` is the radius where it starts and `rEnd` where it finishes after
 * `turns`; `hand` +1 coils counter-clockwise. `fringe` is how far the lobes
 * stand out from the stalk at the start; they shrink toward the tip.
 */
export function leafScroll(
  px: number, py: number,
  cx: number, cy: number,
  R: number, rEnd: number, turns: number,
  start: number, hand: 1 | -1,
  fringe: number, lobes: number, height: number,
): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho > R + fringe * 1.02) return 0
  const total = TAU * turns
  const b = (R - rEnd) / total
  const ribW = Math.max(0.55, fringe * 0.16)
  let th0 = (hand * (Math.atan2(dy, dx) - start)) % TAU
  if (th0 < 0) th0 += TAU

  let best = 0
  for (let k = 0; k < 4; k++) {
    const th = th0 + TAU * k
    if (th > total) break
    const f = th / total
    const dr = rho - (R - b * th)
    const wi = Math.max(0.7, 0.3 * fringe * (1 - 0.5 * f))
    if (dr < -wi) continue
    const rib = 0.3 * Math.exp(-((dr / ribW) ** 2))
    let h: number
    if (dr >= 0) {
      const wo = fringe * (1 - 0.5 * f) * smoothstep(0, 0.06, f)
      if (dr >= wo) continue
      const q = (th - 0.95 * (dr / fringe)) * (lobes / total)
      const w = wo * (0.34 + 0.66 * tooth(fract(q)))
      const r = dr / Math.max(0.3, w)
      if (r >= 1) {
        if (dr > ribW * 2) continue
        h = 0.36 + rib
      } else {
        const pillow = Math.pow(Math.abs(Math.sin(Math.PI * q)), 0.55)
        const lobed = 1 - (1 - pillow) * smoothstep(0.1, 0.5, r)
        h = 0.36 + 0.4 * Math.sqrt(1 - r * r) * (0.5 + 0.5 * lobed) + rib
      }
    } else {
      const r = -dr / wi
      h = 0.36 + 0.4 * Math.sqrt(1 - r * r) + rib
    }
    const v = height * (0.8 + 0.2 * f) * Math.min(1, h) * smoothstep(0, 0.025, f)
    if (v > best) best = v
  }
  // The tip rolls over into a small knob.
  const end = start + hand * total
  const knob = height * 0.98 * dome(px, py, cx + rEnd * Math.cos(end), cy + rEnd * Math.sin(end), Math.max(1, fringe * 0.42))
  return Math.max(best, knob)
}

/** A plain raised ribbon of half-width `half` running along y = `at`. */
export const ridge = (y: number, at: number, half: number) => cap(Math.abs(y - at), half)

/**
 * A scallop shell: convex flutes radiating from a hinge at `(cx, cy)` around
 * direction `axis`, swelling to a crown and rolling over to a scalloped rim.
 */
export function shell(
  px: number, py: number,
  cx: number, cy: number,
  axis: number, spread: number, radius: number, ribs: number, height: number,
): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho > radius * 1.02) return 0
  let phi = Math.atan2(dy, dx) - axis
  phi = Math.atan2(Math.sin(phi), Math.cos(phi))
  const t = Math.abs(phi) / spread
  if (t >= 1) return 0
  // An odd number of flutes puts one on the axis.
  const wave = Math.abs(Math.cos((phi / spread) * ribs * Math.PI * 0.5))
  const flute = Math.pow(wave, 0.45)
  const rim = radius * (0.83 + 0.17 * Math.sqrt(wave)) * Math.sqrt(1 - 0.5 * t * t)
  if (rho >= rim) return 0
  const radial = rho / rim
  const crown = Math.sin(Math.PI * Math.min(1, 0.12 + 0.8 * radial))
  const lip = 0.25 * smoothstep(0.8, 0.97, radial)
  const body = 0.34 + (0.52 * crown + lip) * (0.3 + 0.7 * flute)
  // Flutes narrow to nothing at the hinge, so fade them in.
  const fan = smoothstep(0.04, 0.22, radial)
  return height * Math.min(1, 0.34 + (body - 0.34) * (0.6 + 0.4 * fan)) * smoothstep(1, 0.86, t)
}

/** A flower seen face-on: dished petals with a rolled edge round a raised boss. */
export function rosette(px: number, py: number, cx: number, cy: number, radius: number, petals: number, height: number): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho >= radius) return 0
  const phi = Math.atan2(dy, dx)
  const lobe = Math.abs(Math.cos((petals * phi) / 2))
  const edge = radius * (0.72 + 0.28 * Math.pow(lobe, 0.55))
  let petal = 0
  if (rho < edge) {
    const r = rho / edge
    const between = 1 - 0.5 * Math.pow(1 - lobe, 3) * smoothstep(0.3, 0.8, r)
    petal = (0.45 + 0.4 * Math.sin(Math.PI * Math.min(1, r * 0.85 + 0.1)) * smoothstep(1, 0.9, r) + 0.1 * r) * between
  }
  const boss = cap(rho, radius * 0.3)
  return height * Math.max(petal, 0.6 + 0.4 * boss > 0.6 && rho < radius * 0.3 ? 0.62 + 0.38 * boss : 0)
}
