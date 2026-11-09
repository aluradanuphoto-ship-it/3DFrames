import type { OrnamentConfig, OrnamentSymmetry, Vec2 } from '../types.ts'
import type { MiterFrame, OpeningPath } from '../shapes.ts'

/**
 * Laying ornament out along a rectangular frame.
 *
 * Each rail is divided, from each end inward, into:
 *
 *   corner zone ─ whole repeats ─ … ─ whole repeats ─ corner zone
 *
 * The corner zone is the same on every rail, so the four corners match. The
 * repeats are as many as fit at or above the minimum length; the motifs in
 * them keep a fixed size and only the plain stems between motifs grow to use
 * up the remainder. Nothing is ever scaled to fit.
 *
 * Positions along a rail are measured as `d`, the distance from the nearer
 * sight corner, which runs negative past the corner into the mitre. Every
 * ornament is a function of `(d, u)` alone, the same on all four rails; that
 * is what makes the relief meet itself exactly across each mitre and mirror
 * about the middle of each rail without any special casing.
 */

export interface EdgeLayout {
  /** Length of the sight edge (mm). */
  length: number
  /** Where the corner zone ends and the repeats begin (mm from the corner). */
  corner: number
  /** Whole repeats along the rail. Zero on a rail too short for one. */
  count: number
  /** Length of each repeat (mm). */
  pitch: number
}

export interface OrnamentGeometry {
  /** Moulding width (mm). */
  width: number
  /** Relief height (mm). */
  depth: number
  detail: number
  corners: boolean
  symmetry: OrnamentSymmetry
  /** Corner zone length (mm), shared by every rail. */
  corner: number
  /** Minimum repeat length (mm). */
  minPitch: number
  /** Half the sight width and height. */
  hw: number
  hh: number
  /** Bottom/top rails, and left/right rails. */
  horizontal: EdgeLayout
  vertical: EdgeLayout
}

/** Below this width there is not room for a scroll that will print cleanly. */
export const MIN_ORNAMENT_WIDTH = 28

export function layoutOrnament(
  sightWidth: number,
  sightHeight: number,
  width: number,
  o: OrnamentConfig,
): OrnamentGeometry {
  const corner = width * (o.corners ? 1.15 : 0.8)
  const minPitch = width * Math.max(1.2, o.spacing)
  const edge = (length: number): EdgeLayout => {
    const usable = length - 2 * corner
    if (usable < minPitch * 0.92) return { length, corner: Math.min(corner, length / 2), count: 0, pitch: 0 }
    // A repeat may be squeezed by up to 8 %, which only shortens the stem
    // between motifs, rather than leave a long bare stem on every rail.
    const count = Math.floor(usable / (minPitch * 0.92))
    return { length, corner, count, pitch: usable / count }
  }
  return {
    width,
    depth: Math.max(0, o.depth),
    detail: Math.min(1, Math.max(0, o.detail)),
    corners: o.corners,
    symmetry: o.symmetry,
    corner,
    minPitch,
    hw: sightWidth / 2,
    hh: sightHeight / 2,
    horizontal: edge(sightWidth),
    vertical: edge(sightHeight),
  }
}

/** One cross-section position: where the sweep places a row of the profile. */
export interface OrnamentPath extends OpeningPath {
  /**
   * Per column, the plan direction and stretch of the cross-section. Straight
   * columns are perpendicular to the rail; near a corner they fan out to meet
   * the mitre, which is what lets the relief be sampled as finely in the
   * corner as along the rail.
   */
  frames: MiterFrame[]
  /** Columns a seam may be cut on: repeat boundaries, never inside a motif. */
  seamable: boolean[]
  /** Columns a clip may sit on: repeat centres and rail midpoints. */
  clipable: boolean[]
  /** Columns square to their rail, outside the corner fans. */
  square: boolean[]
  /** Which rail each column belongs to, 0..3 counter-clockwise from the bottom. */
  edge: number[]
  /** Distance along its rail from the rail's start corner (mm). */
  along: number[]
}

/**
 * The columns the moulding is swept through.
 *
 * Every column is a straight line in plan, `base + u · vec`, which is all the
 * existing sweep, splitter, joints and accessories need — so the ornamented
 * frame reuses all of them unchanged.
 */
export function ornamentPath(geo: OrnamentGeometry, step: number): OrnamentPath {
  const { hw, hh } = geo
  const C: Vec2[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
  const out: OrnamentPath = { points: [], sharp: [], frames: [], seamable: [], clipable: [], square: [], edge: [], along: [] }

  const push = (e: number, a: number, base: Vec2, vec: Vec2, sharp: boolean, seam: boolean, clip: boolean, square = false) => {
    const scale = Math.hypot(vec[0], vec[1])
    out.points.push(base)
    out.frames.push({ dir: [vec[0] / scale, vec[1] / scale], scale })
    out.sharp.push(sharp)
    out.seamable.push(seam)
    out.clipable.push(clip)
    out.square.push(square)
    out.edge.push(e)
    out.along.push(a)
  }

  for (let e = 0; e < 4; e++) {
    const start = C[e]
    const end = C[(e + 1) % 4]
    const L = Math.hypot(end[0] - start[0], end[1] - start[1])
    const T: Vec2 = [(end[0] - start[0]) / L, (end[1] - start[1]) / L]
    const N: Vec2 = [T[1], -T[0]]
    const layout = e % 2 === 0 ? geo.horizontal : geo.vertical
    // The fan only has to turn the mitre; it stops well short of the corner
    // zone, so there are square columns near each corner for a clip.
    const wedge = Math.min(layout.corner, geo.width * 0.6)
    const at = (a: number): Vec2 => [start[0] + T[0] * a, start[1] + T[1] * a]

    // The fan from the mitre (f = 0) to the first square column (f = 1).
    // Spacing is set by the outer edge, where the fan is widest.
    const fan = Math.max(2, Math.ceil((wedge + geo.width * 0.6) / step))
    for (let k = 0; k < fan; k++) {
      const f = k / fan
      push(e, wedge * f, at(wedge * f), [(f - 1) * T[0] + N[0], (f - 1) * T[1] + N[1]], k === 0, false, false)
    }

    // Square columns between the two fans.
    const straight: { a: number; seam: boolean; clip: boolean }[] = []
    // Plain columns over [from, to), leaving out `from` itself when it is
    // already a column.
    const plain = (from: number, to: number, skipFirst = false) => {
      if (to - from < 1e-6) return
      const sub = Math.max(1, Math.ceil((to - from) / step))
      for (let j = skipFirst ? 1 : 0; j < sub; j++) straight.push({ a: from + ((to - from) * j) / sub, seam: false, clip: false })
    }
    if (layout.count > 0) {
      plain(wedge, layout.corner)
      let sub = Math.max(2, Math.ceil(layout.pitch / step))
      if (sub % 2) sub++
      for (let t = 0; t < layout.count; t++) {
        const a0 = layout.corner + t * layout.pitch
        for (let j = 0; j < sub; j++) {
          straight.push({ a: a0 + (j * layout.pitch) / sub, seam: j === 0, clip: j === sub / 2 })
        }
      }
      straight.push({ a: L - layout.corner, seam: true, clip: false })
      plain(L - layout.corner, L - wedge, true)
      if (L - wedge - (L - layout.corner) > 1e-6) straight.push({ a: L - wedge, seam: false, clip: false })
    } else if (L - 2 * wedge > 1e-6) {
      let sub = Math.max(2, Math.ceil((L - 2 * wedge) / step))
      if (sub % 2) sub++
      for (let j = 0; j <= sub; j++) {
        const mid = j === sub / 2
        // Too short for a repeat: the only place worth a seam is the middle,
        // where the corner pieces meet, rather than leaving a short stub.
        straight.push({ a: wedge + (j * (L - 2 * wedge)) / sub, seam: mid, clip: mid })
      }
    } else {
      straight.push({ a: L / 2, seam: true, clip: true })
    }
    // Every rail needs somewhere central for a clip, even with an even count.
    const mid = straight.reduce((best, c) => (Math.abs(c.a - L / 2) < Math.abs(best.a - L / 2) ? c : best))
    mid.clip = true
    for (const c of straight) push(e, c.a, at(c.a), N, false, c.seam, c.clip, true)

    // And back down the fan to the next mitre, which belongs to the next rail.
    for (let k = fan - 1; k > 0; k--) {
      const f = k / fan
      push(e, L - wedge * f, at(L - wedge * f), [N[0] + (1 - f) * T[0], N[1] + (1 - f) * T[1]], false, false, false)
    }
  }
  return out
}

/** Summary for the UI: repeats per rail and corner length. */
export function describeLayout(geo: OrnamentGeometry): { horizontal: number; vertical: number; pitchH: number; pitchV: number } {
  return {
    horizontal: geo.horizontal.count,
    vertical: geo.vertical.count,
    pitchH: geo.horizontal.pitch,
    pitchV: geo.vertical.pitch,
  }
}
