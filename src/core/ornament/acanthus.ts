import type { EdgeLayout, OrnamentGeometry } from './layout.ts'
import { cap, dome, ellipse, leaf, ridge, rosette, shell, smoothstep, volute, type LeafShape } from './primitives.ts'

/**
 * Classic Baroque acanthus.
 *
 * Across the moulding, from the sight edge out:
 *
 *   bead-and-reel  │  scroll field  │  gadrooned outer band
 *
 * The scroll field carries the repeats. In the mirrored arrangement each
 * repeat is a pair of C-scrolls rolled away from a central acanthus fan, their
 * tails sheathed in leaves and joined to the next repeat by a plain stem. In
 * the running arrangement the stem is a continuous wave throwing off a scroll
 * at every crest. Each corner carries a fan shell on the mitre with a great
 * acanthus leaf sweeping from it along both rails into a scroll.
 *
 * All dimensions are proportions of the moulding width `W` so the carving
 * keeps its character at any size; heights are fractions of the relief depth.
 * Nothing narrower than about 1.2 mm is ever produced at the minimum width.
 */

/** Positions across the moulding, as fractions of its width. */
const BEAD_U = 0.12
const BEAD_R = 0.05
const STEM_U = 0.36
const SCROLL_R = 0.235
const GADROON_U = 0.885
const GADROON_HALF = 0.06

/** Fraction of the minimum repeat the motif itself occupies; the rest is stem. */
export const MOTIF_FRACTION = 0.86

export function acanthus(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry, a = d): number {
  const W = g.width
  const D = g.depth
  if (D <= 0) return 0

  let h = Math.max(bands(d, u, edge, g), cushion(u, g))

  const stemHalf = Math.max(0.8, 0.045 * W)
  if (d < edge.corner) {
    h = Math.max(h, corner(-d, u, edge, g, stemHalf))
  } else if (edge.count === 0) {
    // A rail too short for a repeat: just the stem across the gap.
    h = Math.max(h, 0.55 * D * ridge(u, STEM_U * W, stemHalf))
  } else {
    // A symmetrical repeat is read from the nearer corner, so the rail mirrors
    // about its middle; a running vine is read along the rail, so it flows
    // one way from corner to corner. Both meet the corners on a plain stem.
    const q = (g.symmetry === 'running' ? a : d) - edge.corner
    const k = Math.min(edge.count - 1, Math.max(0, Math.floor(q / edge.pitch)))
    const t = q - (k + 0.5) * edge.pitch
    h = Math.max(h, g.symmetry === 'running' ? running(t, u, edge.pitch, g, stemHalf) : mirrored(t, u, edge.pitch, g, stemHalf))
  }

  // Let the relief die away at both edges of the moulding: a crisp sight line,
  // and an outer silhouette that is the profile's and not the carving's.
  const fade = smoothstep(0, Math.min(2, W * 0.04), u) * smoothstep(0, Math.min(2, W * 0.04), W - u)
  return h * fade
}

/**
 * A broad half-round torus under the scroll field. Carving stands on it, so the
 * scrolls sit a layer above the bands either side instead of on a flat floor.
 */
function cushion(u: number, g: OrnamentGeometry): number {
  const W = g.width
  const lo = 0.2 * W
  const hi = 0.8 * W
  const half = (hi - lo) / 2
  return 0.3 * g.depth * cap(Math.abs(u - (lo + hi) / 2), half) ** 0.6
}

/** The bead-and-reel and gadroon bands, continuous along the whole rail. */
function bands(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  if (g.detail < 0.2) return 0
  const W = g.width
  const D = g.depth
  let h = 0

  const beadR = Math.max(0.9, BEAD_R * W)
  const beadU = BEAD_U * W
  if (Math.abs(u - beadU) < beadR) {
    h = Math.max(h, 0.5 * D * row(d, edge, g, beadU, beadR * 2.3, (c) => dome(d, u, c, beadU, beadR)))
  }

  const gU = GADROON_U * W
  const gHalf = GADROON_HALF * W
  if (g.detail >= 0.45 && Math.abs(u - gU) < gHalf) {
    const pitch = Math.max(2.4, 0.085 * W)
    h = Math.max(h, 0.42 * D * row(d, edge, g, gU, pitch, (c, p) => ellipse(d, u, c, gU, p * 0.44, gHalf)))
  }
  return h
}

/**
 * A row of identical elements along the rail, spaced so they divide the corner
 * zone and every repeat into whole numbers. One sits exactly on the mitre, so
 * the row turns the corner without a half-element at the join.
 */
function row(
  d: number,
  edge: EdgeLayout,
  g: OrnamentGeometry,
  across: number,
  target: number,
  element: (centre: number, pitch: number) => number,
): number {
  let best = 0
  // Corner run: from the mitre (d = −across) to the corner zone boundary.
  // On a rail with no repeats the corner run reaches the middle, where the row
  // mirrors onto itself.
  const reachTo = edge.count > 0 ? edge.corner : edge.length / 2
  const run = reachTo + across
  const m = Math.max(1, Math.round(run / target - 0.5))
  const pc = run / (m + 0.5)
  if (d < reachTo + pc) {
    const k = Math.round((d + across) / pc)
    for (let j = k - 1; j <= k + 1; j++) {
      if (j < 0 || j > m + (edge.count > 0 ? 0 : 1)) continue
      best = Math.max(best, element(-across + j * pc, pc))
    }
  }
  if (edge.count > 0 && d > edge.corner - target) {
    const per = Math.max(1, Math.round(edge.pitch / target))
    const pf = edge.pitch / per
    const j0 = Math.floor((d - edge.corner) / pf)
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      if (j < 0) continue
      best = Math.max(best, element(edge.corner + (j + 0.5) * pf, pf))
    }
  }
  void g
  return best
}

function leafShape(g: OrnamentGeometry, length: number, half: number, curl: number, height: number): LeafShape {
  return {
    length,
    half: Math.max(1, half),
    lobes: Math.max(2, Math.round((2 + 2.5 * g.detail) * Math.min(1.6, length / (0.4 * g.width)))),
    curl,
    height,
  }
}

/**
 * Half a repeat, in coordinates where the motif's centre is at x = `centre`
 * and x decreases toward the repeat boundary. A stem sheathed in acanthus runs
 * out from the centre to a C-scroll, which rolls back toward the centre — so at
 * every boundary two scrolls stand back to back, tied by a small rosette.
 */
function halfRepeat(x: number, u: number, centre: number, cx: number, boundary: number, g: OrnamentGeometry, stemHalf: number, tied = true): number {
  const W = g.width
  const D = g.depth
  const R = SCROLL_R * W
  const stem = STEM_U * W
  let h = 0
  // Stem from the centre out to the scroll, and on across the tie.
  if (x <= centre) h = 0.55 * D * ridge(u, stem, stemHalf)
  // The scroll, rolling up its outer side and back in toward the centre.
  h = Math.max(h, volute(x, u, cx, stem + R, R, Math.max(1.1, 0.05 * W), 1.35, -Math.PI / 2, -1, 0.66 * D, 0.95 * D))
  // Acanthus sheathing the stem, growing out of the centre toward the scroll,
  // with a second rank behind it so the stem is clothed in foliage.
  const reach = centre - cx
  h = Math.max(h, leaf(x, u, centre - 0.04 * W, stem - 0.03 * W, Math.PI + 0.12, leafShape(g, 0.78 * reach, 0.15 * W, -0.22, 0.92 * D)))
  h = Math.max(h, leaf(x, u, centre - 0.1 * W, stem + 0.02 * W, Math.PI - 0.5, leafShape(g, 0.5 * reach, 0.11 * W, -0.25, 0.78 * D)))
  // A small leaf tucked under the scroll's throat.
  h = Math.max(h, leaf(x, u, cx + 0.3 * R, stem - 0.02 * W, Math.PI + 0.9, leafShape(g, 0.8 * R, 0.075 * W, -0.3, 0.68 * D)))
  // Where the scrolls stand back to back: a band ties them if they are close,
  // and a rosette with a leaf each side fills the stem if they are not. Both
  // are a fixed size, centred on the boundary, so the gap is filled without
  // anything being stretched.
  // A tie straddles the boundary, so it is only drawn where the far side
  // draws its other half: between two symmetrical repeats.
  const gap = cx - R - boundary
  if (!tied) {
    // Plain stem only; a running vine picks it up on the other side.
  } else if (gap < 0.32 * W) {
    h = Math.max(h, 0.78 * D * ellipse(x, u, boundary, stem, Math.max(1.2, 0.05 * W), 0.1 * W))
  } else {
    h = Math.max(h, rosette(x, u, boundary, stem, 0.13 * W, 6, 0.9 * D))
    h = Math.max(h, leaf(x, u, boundary + 0.1 * W, stem, 0.1, leafShape(g, Math.min(gap - 0.06 * W, 0.4 * W), 0.09 * W, 0.15, 0.75 * D)))
  }
  return h
}

/** A symmetrical repeat: two C-scrolls springing from a central acanthus cluster. */
function mirrored(t: number, u: number, pitch: number, g: OrnamentGeometry, stemHalf: number): number {
  const W = g.width
  const D = g.depth
  const x = -Math.abs(t)
  const motif = MOTIF_FRACTION * g.minPitch
  const R = SCROLL_R * W
  let h = halfRepeat(x, u, 0, -(motif / 2 - R), -pitch / 2, g, stemHalf)

  // The central cluster: a tall leaf, two that curl outward over the stems,
  // and a pair hanging below.
  const by = STEM_U * W - 0.02 * W
  h = Math.max(h, 0.85 * D * dome(x, u, 0, by, Math.max(1.4, 0.09 * W)))
  h = Math.max(h, leaf(x, u, 0, by, Math.PI / 2, leafShape(g, 0.5 * W, 0.15 * W, 0, D)))
  h = Math.max(h, leaf(x, u, 0, by, Math.PI / 2 + 0.6, leafShape(g, 0.44 * W, 0.13 * W, 0.3, 0.88 * D)))
  h = Math.max(h, leaf(x, u, 0, by, Math.PI / 2 + 1.3, leafShape(g, 0.3 * W, 0.1 * W, 0.35, 0.72 * D)))
  h = Math.max(h, leaf(x, u, 0, by, -Math.PI / 2 - 0.6, leafShape(g, 0.17 * W, 0.07 * W, -0.3, 0.6 * D)))
  return h
}

/**
 * A running repeat: a wave-shaped stem throwing off one scroll at its crest
 * and a leaf into its trough. Because positions are measured from the nearer
 * corner, the vine flows out from the middle of each rail toward its corners.
 */
function running(t: number, u: number, pitch: number, g: OrnamentGeometry, stemHalf: number): number {
  const W = g.width
  const D = g.depth
  const stem = STEM_U * W
  // The wave arrives at each boundary level and flat (the cos² envelope), so
  // it meets the next repeat, and the straight stem in a corner, without a kink.
  const amp = 0.12 * W
  const k = (2 * Math.PI) / pitch
  const env = Math.cos((Math.PI * t) / pitch) ** 2
  const ys = stem + amp * Math.sin(k * t) * env
  const slope = amp * (k * Math.cos(k * t) * env - (Math.PI / pitch) * Math.sin(k * t) * Math.sin((2 * Math.PI * t) / pitch))
  let h = 0.55 * D * cap(Math.abs(u - ys) / Math.sqrt(1 + slope * slope), stemHalf)

  const R = 0.2 * W
  const crest = pitch / 4
  const top = stem + amp * 0.65
  // The scroll leaves the crest and rolls back against the flow, wrapped in a
  // leaf; two more leaves are thrown down into the trough.
  h = Math.max(h, volute(t, u, crest + 0.15 * R, top + R, R, Math.max(1.1, 0.05 * W), 1.35, -Math.PI / 2, -1, 0.66 * D, 0.95 * D))
  h = Math.max(h, leaf(t, u, crest - 1.9 * R, top - 0.03 * W, 0.18, leafShape(g, 1.75 * R, 0.14 * W, 0.22, 0.92 * D)))
  h = Math.max(h, leaf(t, u, -crest - 1.4 * R, stem - amp * 0.5, -0.2, leafShape(g, 0.48 * W, 0.14 * W, -0.25, 0.88 * D)))
  h = Math.max(h, leaf(t, u, -crest + 0.2 * R, stem - amp * 0.6, -2.3, leafShape(g, 0.22 * W, 0.08 * W, 0.3, 0.65 * D)))
  return h
}

/**
 * The corner, in coordinates `(x, u)` where x = −d increases toward the mitre
 * and the mitre itself is the line x = u. Only the half x ≤ u is ever asked
 * for; the other rail's half is the mirror image, which makes every corner
 * symmetrical about its diagonal by construction.
 */
function corner(x: number, u: number, edge: EdgeLayout, g: OrnamentGeometry, stemHalf: number): number {
  const W = g.width
  const D = g.depth
  const stem = STEM_U * W
  if (!g.corners) return 0.55 * D * ridge(u, stem, stemHalf)

  const R = SCROLL_R * W
  const tie = ((1 - MOTIF_FRACTION) / 2) * g.minPitch
  const boundary = -edge.corner
  // The leg is half a repeat whose centre is the shell.
  let h = halfRepeat(x, u, 0.12 * W, boundary + tie + R, boundary, g, stemHalf, g.symmetry === 'mirrored')

  const c = 0.2 * W
  h = Math.max(h, shell(x, u, c, c, Math.PI / 4, 1.1, 0.7 * W, 7 + Math.round(4 * g.detail), D))
  // Leaves spilling from under the shell onto each rail.
  h = Math.max(h, leaf(x, u, c, c + 0.08 * W, Math.PI * 0.62, leafShape(g, 0.36 * W, 0.1 * W, 0.3, 0.85 * D)))
  return h
}
