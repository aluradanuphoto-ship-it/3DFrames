import type { OrnamentStyle, ProfilePoint } from '../types.ts'
import type { EdgeLayout, OrnamentGeometry } from './layout.ts'
import { acanthus } from './acanthus.ts'

/**
 * Relief height above the moulding face at `(d, u)` on a rail. `a` is the
 * distance along the rail from its start corner, counter-clockwise, for
 * patterns that flow one way instead of mirroring about the rail's middle.
 */
export type OrnamentStyleFn = (d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry, a: number) => number

export const ORNAMENT_STYLES: {
  id: OrnamentStyle
  label: string
  blurb: string
  fn: OrnamentStyleFn | null
}[] = [
  { id: 'none', label: 'None', blurb: 'Plain moulding', fn: null },
  { id: 'acanthus', label: 'Baroque acanthus', blurb: 'C-scrolls, acanthus and shell corners', fn: acanthus },
]

export const ornamentStyle = (id: OrnamentStyle) => ORNAMENT_STYLES.find((s) => s.id === id)?.fn ?? null

/**
 * The top of the moulding's cross-section as a function of `u`: the highest
 * point of the profile's decorative face at each distance from the sight edge.
 * Ornament sits on this, so the chosen profile still shapes the frame.
 */
export function faceEnvelope(profile: ProfilePoint[]): (u: number) => number {
  // The first three points are the rabbet; the face starts at the back outer
  // corner and runs round to the sight edge.
  const face = profile.slice(3)
  return (u: number) => {
    let best = -Infinity
    for (let i = 0; i < face.length - 1; i++) {
      const a = face[i]
      const b = face[i + 1]
      const lo = Math.min(a.u, b.u)
      const hi = Math.max(a.u, b.u)
      if (u < lo - 1e-9 || u > hi + 1e-9) continue
      const v = hi - lo < 1e-9 ? Math.max(a.v, b.v) : a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u)
      if (v > best) best = v
    }
    return Number.isFinite(best) ? best : profile.reduce((m, p) => Math.max(m, p.v), 0)
  }
}

/** Where a plan point falls on the frame, in rail coordinates. */
export function railCoords(g: OrnamentGeometry, x: number, y: number): { d: number; u: number; a: number; edge: EdgeLayout } {
  const ex = Math.abs(x) - g.hw
  const ey = Math.abs(y) - g.hh
  // The mitres divide the plan between the rails. Rails run counter-clockwise:
  // bottom left to right, right side upward, top right to left, left downward.
  return ex >= ey
    ? { d: g.hh - Math.abs(y), u: Math.min(g.width, Math.max(0, ex)), a: x > 0 ? y + g.hh : g.hh - y, edge: g.vertical }
    : { d: g.hw - Math.abs(x), u: Math.min(g.width, Math.max(0, ey)), a: y < 0 ? x + g.hw : g.hw - x, edge: g.horizontal }
}

/**
 * The finished top surface of an ornamented frame: absolute height in mm at
 * any plan point on the moulding.
 */
export function ornamentField(
  g: OrnamentGeometry,
  style: OrnamentStyleFn,
  profile: ProfilePoint[],
): (x: number, y: number) => number {
  const envelope = faceEnvelope(profile)
  return (x, y) => {
    const { d, u, a, edge } = railCoords(g, x, y)
    return envelope(u) + style(d, u, edge, g, a)
  }
}
