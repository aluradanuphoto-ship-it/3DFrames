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

export interface LeafShape {
  /** Length from base to tip (mm). */
  length: number
  /** Half-width at the widest point (mm). */
  half: number
  /** Number of serrated lobes down each side. */
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
 * An acanthus leaf: a lance-shaped blade with saw-toothed lobes, each half
 * dished like a spoon with a raised rim, and a proud midrib.
 *
 * The dished halves are what make it read as carved rather than moulded: light
 * catches the rim and the rib and leaves the hollows dark.
 */
export function leaf(
  px: number, py: number,
  bx: number, by: number,
  angle: number,
  shape: LeafShape,
): number {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const rx = px - bx
  const ry = py - by
  const x = rx * c + ry * s
  if (x <= 0 || x >= shape.length) return 0
  const xn = x / shape.length
  const bend = shape.curl * shape.length * xn * xn
  const y = -rx * s + ry * c - bend

  const envelope = Math.pow(Math.sin(Math.PI * Math.pow(xn, 0.7)), 0.6)
  const phase = (xn * shape.lobes + 0.15) % 1
  // A saw tooth with a short, smooth return, so the lobes point to the tip.
  const saw = phase < 0.75 ? phase / 0.75 : (1 - phase) / 0.25
  const w = shape.half * envelope * (0.6 + 0.4 * saw)
  if (w <= 0.3) return 0
  const r = Math.abs(y) / w
  if (r >= 1) return 0

  // A carved leaf stands on its own plateau, so its outline reads as a cut
  // edge; each half is dished, and the midrib stands proud between them.
  const body = Math.sqrt(1 - r * r)
  const dish = 1 - 0.38 * Math.sin(Math.PI * r) * (0.6 + 0.4 * saw)
  const rib = 0.22 * Math.exp(-((r / 0.14) ** 2))
  const profile = 0.34 + 0.6 * body * dish + rib
  // Rises from the base and lifts again at the tip, where the leaf turns over.
  const along = 0.72 + 0.2 * Math.sin(Math.PI * xn) + 0.15 * smoothstep(0.7, 1, xn)
  return shape.height * Math.min(1, profile * along) * smoothstep(0, 0.06, xn)
}

/** A plain raised ribbon of half-width `half` running along y = `at`. */
export const ridge = (y: number, at: number, half: number) => cap(Math.abs(y - at), half)

/**
 * A fan shell: ribs radiating from `(cx, cy)` around direction `axis`, with a
 * scalloped rim. Convex overall, highest about a third of the way out.
 */
export function shell(
  px: number, py: number,
  cx: number, cy: number,
  axis: number, spread: number, radius: number, ribs: number, height: number,
): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho > radius * 1.05) return 0
  let phi = Math.atan2(dy, dx) - axis
  phi = Math.atan2(Math.sin(phi), Math.cos(phi))
  const t = Math.abs(phi) / spread
  if (t >= 1) return 0
  const rib = Math.abs(Math.cos((phi / spread) * ribs * Math.PI * 0.5))
  const rim = radius * (0.9 + 0.1 * rib) * Math.sqrt(1 - t * t * 0.35)
  if (rho >= rim) return 0
  const radial = rho / rim
  const crown = Math.sin(Math.PI * Math.min(1, 0.25 + radial * 0.85))
  const flutes = 0.72 + 0.28 * Math.pow(rib, 0.6)
  return height * cap(radial, 1) ** 0.35 * crown * flutes * smoothstep(1, 0.8, t)
}

/** A flower seen face-on: rounded petals round a raised boss. */
export function rosette(px: number, py: number, cx: number, cy: number, radius: number, petals: number, height: number): number {
  const dx = px - cx
  const dy = py - cy
  const rho = Math.hypot(dx, dy)
  if (rho >= radius) return 0
  const phi = Math.atan2(dy, dx)
  const lobe = Math.abs(Math.cos((petals * phi) / 2))
  const edge = radius * (0.62 + 0.38 * Math.pow(lobe, 0.7))
  const petal = rho < edge ? 0.55 + 0.35 * cap(rho, edge) - 0.15 * Math.pow(1 - lobe, 2) : 0
  const boss = cap(rho, radius * 0.32)
  return height * Math.max(petal, boss)
}
