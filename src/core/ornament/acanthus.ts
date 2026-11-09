import type { EdgeLayout, OrnamentGeometry } from './layout.ts'
import { cap, dome, leaf, leafScroll, ridge, rosette, shell, smoothstep, type LeafShape } from './primitives.ts'

/**
 * Classic Baroque acanthus.
 *
 * Across the moulding, from the sight edge out:
 *
 *   astragal │ pearls │ fillet │  carved field  │ fillet │ rope │ rim
 *
 * The field is a recessed ground that the carving stands up from. Each repeat
 * is an upright palmette with a scroll of foliage either side, each scroll
 * coiled round a rosette; neighbouring repeats stand back to back with a bud
 * between them. A corner carries a scallop shell across the mitre, great
 * leaves sweeping from it along both rails, and a scroll on each leg.
 *
 * All dimensions are proportions of the moulding width `W`, so the carving
 * keeps its character at any size; heights are fractions of the relief depth.
 */

/** The carved field, as fractions of the moulding width. */
const FIELD_LO = 0.245
const FIELD_HI = 0.795
const FIELD_MID = (FIELD_LO + FIELD_HI) / 2

/** A scroll: stalk radius, how far its foliage stands out, and its rosette. */
const SCROLL_R = 0.16
const SCROLL_FRINGE = 0.102
const SCROLL_EXTENT = SCROLL_R + SCROLL_FRINGE
const ROSETTE_R = 0.1

/** How far a scroll stands from the palmette it springs from. */
const SCROLL_OFFSET = 0.44
/** Half the length of one motif; a repeat is never shorter than twice this. */
export const MOTIF_HALF = SCROLL_OFFSET + SCROLL_EXTENT

/** Everything fades to the shared ground over this distance from a zone boundary (mm). */
const WINDOW_MM = 1.2

export function acanthus(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry, a = d): number {
  const W = g.width
  const D = g.depth
  if (D <= 0) return 0

  let h = bands(d, u, edge, g)

  const mask = smoothstep(FIELD_LO * W, FIELD_LO * W + 0.6, u) * smoothstep(FIELD_HI * W, FIELD_HI * W - 0.6, u)
  if (mask > 0) {
    let field = 0
    if (d < edge.corner) {
      field = corner(-d, u, edge, g) * smoothstep(0, WINDOW_MM, edge.corner - d)
    } else if (edge.count === 0) {
      // Too short for a repeat: one bud in the middle, between the corners.
      const half = edge.length / 2 - edge.corner
      field = filler(d - edge.length / 2, u, half, g) * smoothstep(0, WINDOW_MM, d - edge.corner)
    } else if (g.symmetry === 'running') {
      field = running(a, u, edge, g)
    } else {
      field = mirrored(d, u, edge, g)
    }
    h = Math.max(h, field * mask)
  }

  if (g.corners && d < 0.4 * W) h = Math.max(h, cornerShell(-d, u, g))

  // Let the relief die away at both edges of the moulding: a crisp sight line,
  // and an outer silhouette that is the profile's and not the carving's.
  const fade = smoothstep(0, Math.min(1.5, W * 0.03), u) * smoothstep(0, Math.min(1.5, W * 0.03), W - u)
  return h * fade
}

/** The plain and enriched mouldings that border the field, continuous along the rail. */
function bands(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  const fillet = Math.max(0.8, 0.02 * W)
  // The fillets either side of the field are what make the ground read as sunk.
  let h = 0.34 * D * Math.max(ridge(u, (FIELD_LO - 0.028) * W, fillet), ridge(u, (FIELD_HI + 0.028) * W, fillet))
  h = Math.max(h, 0.3 * D * ridge(u, 0.05 * W, Math.max(0.9, 0.038 * W)))

  // Pearls.
  const pearlU = 0.142 * W
  const pearlR = Math.max(0.9, 0.046 * W)
  if (Math.abs(u - pearlU) < pearlR) {
    h = Math.max(h, g.detail >= 0.2
      ? 0.52 * D * row(d, edge, pearlU, pearlR * 2.15, (c) => dome(d, u, c, pearlU, pearlR))
      : 0.4 * D * ridge(u, pearlU, pearlR))
  }

  // Rope: a torus cut by slanting grooves into strands.
  const ropeU = 0.905 * W
  const ropeHalf = Math.max(1.4, 0.058 * W)
  if (Math.abs(u - ropeU) < ropeHalf) {
    const torus = Math.pow(cap(Math.abs(u - ropeU), ropeHalf), 0.8)
    if (g.detail < 0.2) {
      h = Math.max(h, 0.62 * D * torus)
    } else {
      const pitch = Math.max(2.6, 0.085 * W)
      const strand = row(d, edge, ropeU, pitch, (c, p) => {
        // Each strand is an ellipse laid at a slant across the torus.
        const dx = d - c
        const du = u - ropeU
        const along = dx * 0.62 + du * 0.78
        const across = -dx * 0.78 + du * 0.62
        return cap(Math.hypot(along / (ropeHalf * 1.45), across / (p * 0.43)), 1)
      }, 2)
      h = Math.max(h, 0.66 * D * torus * (0.5 + 0.5 * Math.pow(strand, 0.6)))
    }
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
  across: number,
  target: number,
  element: (centre: number, pitch: number) => number,
  reach = 1,
): number {
  let best = 0
  // On a rail with no repeats the corner run reaches the middle, where the row
  // mirrors onto itself.
  const reachTo = edge.count > 0 ? edge.corner : edge.length / 2
  const run = reachTo + across
  const m = Math.max(1, Math.round(run / target - 0.5))
  const pc = run / (m + 0.5)
  if (d < reachTo + pc * reach) {
    const k = Math.round((d + across) / pc)
    for (let j = k - reach; j <= k + reach; j++) {
      if (j > m + (edge.count > 0 ? 0 : reach)) continue
      best = Math.max(best, element(-across + j * pc, pc))
    }
  }
  if (edge.count > 0 && d > edge.corner - target * reach) {
    const per = Math.max(1, Math.round(edge.pitch / target))
    const pf = edge.pitch / per
    const j0 = Math.floor((d - edge.corner) / pf)
    for (let j = j0 - reach; j <= j0 + reach; j++) {
      if (j < 0) continue
      best = Math.max(best, element(edge.corner + (j + 0.5) * pf, pf))
    }
  }
  return best
}

function leafShape(g: OrnamentGeometry, length: number, half: number, curl: number, height: number): LeafShape {
  return {
    length,
    half: Math.max(1, half),
    lobes: Math.max(2, Math.round((2 + 2 * g.detail) * Math.min(1.7, length / (0.4 * g.width)))),
    curl,
    height,
  }
}

/**
 * A scroll of foliage coiled round a rosette, centred on x = 0. The stalk
 * springs from low on the +x side, sweeps under, up the far side and over the
 * top, and its tip turns in beside the flower.
 */
function scroll(x: number, u: number, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  if (Math.abs(x) > 0.36 * W) return 0
  const uc = FIELD_MID * W
  const lobes = Math.round(5 + 3 * g.detail)
  let h = leafScroll(x, u, 0, uc, SCROLL_R * W, 0.126 * W, 0.97, -0.75, -1, SCROLL_FRINGE * W, lobes, 0.86 * D)
  h = Math.max(h, rosette(x, u, 0, uc, ROSETTE_R * W, 6, 0.97 * D))
  if (g.detail >= 0.35) {
    // Leaf tips breaking out of the scroll into the corners of its cell.
    const r0 = 0.15 * W
    for (const [sx, su] of [[-1, 1], [-1, -1], [1, 1]] as const) {
      const ang = Math.atan2(su, sx * 1.15)
      h = Math.max(h, leaf(x, u, r0 * Math.cos(ang), uc + r0 * Math.sin(ang), ang, leafShape(g, 0.2 * W, 0.075 * W, 0.18 * sx * su, 0.72 * D)))
    }
  }
  return h
}

/** The upright palmette, as seen from x ≤ 0; the other half is its mirror image. */
function palmette(x: number, u: number, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  if (x < -0.42 * W) return 0
  const by = (FIELD_LO + 0.11) * W
  let h = leaf(x, u, 0, by, Math.PI / 2, leafShape(g, 0.43 * W, 0.12 * W, 0, D))
  h = Math.max(h, leaf(x, u, -0.01 * W, by + 0.01 * W, Math.PI / 2 + 0.58, leafShape(g, 0.4 * W, 0.115 * W, 0.34, 0.9 * D)))
  h = Math.max(h, leaf(x, u, -0.02 * W, by, Math.PI / 2 + 1.22, leafShape(g, 0.31 * W, 0.1 * W, 0.42, 0.78 * D)))
  // A pendant below, and the cup they all spring from.
  h = Math.max(h, leaf(x, u, 0, by, -Math.PI / 2, leafShape(g, 0.115 * W, 0.05 * W, 0, 0.7 * D)))
  h = Math.max(h, 0.92 * D * dome(x, u, 0, by, Math.max(1.3, 0.062 * W)))
  h = Math.max(h, 0.8 * D * dome(x, u, -0.085 * W, by - 0.012 * W, Math.max(1, 0.036 * W)))
  return h
}

/**
 * What fills a gap between motifs: a bud with a leaf above and below, and,
 * when there is room, leaves reaching out along the rail. Everything has a
 * fixed size or stops short, so slack in the layout is taken up without any
 * motif being stretched. `s` is measured from the middle of the gap, which is
 * `avail` wide each side.
 */
function filler(s: number, u: number, avail: number, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  if (avail < 0.045 * W) return 0
  const x = Math.abs(s)
  if (x > avail + 0.02 * W) return 0
  const uc = FIELD_MID * W
  const bud = Math.min(0.1 * W, avail * 0.75)
  const half = Math.min(0.075 * W, avail * 0.8)
  let h = leaf(x, u, 0, uc + bud * 0.4, Math.PI / 2, leafShape(g, 0.25 * W - bud * 0.4, half, 0, 0.84 * D))
  h = Math.max(h, leaf(x, u, 0, uc - bud * 0.4, -Math.PI / 2, leafShape(g, 0.25 * W - bud * 0.4, half, 0, 0.84 * D)))
  h = Math.max(h, bud >= 0.055 * W ? rosette(x, u, 0, uc, bud, 5, 0.92 * D) : 0.9 * D * dome(x, u, 0, uc, bud))
  const span = Math.min(avail - bud * 0.7 - 0.02 * W, 0.75 * W)
  if (span >= 0.13 * W) {
    // With room to spare the bud throws a great leaf each way along the rail,
    // and smaller ones into the corners between.
    h = Math.max(h, leaf(x, u, bud * 0.7, uc, 0, leafShape(g, span, Math.min(0.17 * W, span * 0.4), 0, 0.88 * D)))
    if (span >= 0.3 * W) {
      for (const up of [1, -1]) {
        h = Math.max(h, leaf(x, u, bud * 0.5, uc + up * bud * 0.5, up * 0.62, leafShape(g, 0.27 * W, 0.075 * W, -0.3 * up, 0.74 * D)))
      }
    }
  }
  return h
}

/** Symmetrical repeats: palmette in the middle, a scroll either side. */
function mirrored(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  const W = g.width
  const q = d - edge.corner
  const k = Math.min(edge.count - 1, Math.max(0, Math.floor(q / edge.pitch)))
  const t = q - (k + 0.5) * edge.pitch
  const x = -Math.abs(t)
  let h = Math.max(palmette(x, u, g), scroll(x + SCROLL_OFFSET * W, u, g))

  const gap = edge.pitch / 2 - MOTIF_HALF * W
  if (k === 0 && t < 0) {
    // Against a corner zone the bud sits wholly on this side of the boundary.
    h = Math.max(h, filler(x + edge.pitch / 2 - gap / 2, u, gap / 2, g))
    h *= smoothstep(0, WINDOW_MM, t + edge.pitch / 2)
  } else {
    // Between two repeats it straddles the boundary, half drawn by each.
    h = Math.max(h, filler(x + edge.pitch / 2, u, gap, g))
  }
  return h
}

/**
 * A running rinceau: scrolls that coil alternately toward the outer and the
 * inner edge, following one another round the frame, with buds between.
 */
function running(a: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  const W = g.width
  const q = a - edge.corner
  const span = edge.count * edge.pitch
  const k = Math.min(edge.count - 1, Math.max(0, Math.floor(q / edge.pitch)))
  const t = q - (k + 0.5) * edge.pitch
  const quarter = edge.pitch / 4
  const flip = 2 * FIELD_MID * W - u
  let h = Math.max(scroll(t + quarter, u, g), scroll(t - quarter, flip, g))
  const gap = quarter - SCROLL_EXTENT * W
  h = Math.max(h, filler(t, flip, gap, g))
  // The bud on a boundary is drawn by both repeats, except against a corner.
  const side = t < 0 ? -1 : 1
  const atEnd = (side < 0 && k === 0) || (side > 0 && k === edge.count - 1)
  h = Math.max(h, atEnd
    ? filler(t - side * (2 * quarter - gap / 2), u, gap / 2, g)
    : filler(t - side * 2 * quarter, u, gap, g))
  return h * smoothstep(0, WINDOW_MM, q) * smoothstep(0, WINDOW_MM, span - q)
}

/**
 * The corner, in coordinates `(x, u)` where x = −d increases toward the mitre
 * and the mitre itself is the line x = u. Only the half x ≤ u is ever asked
 * for; the other rail's half is the mirror image, which makes every corner
 * symmetrical about its diagonal by construction.
 */
function corner(x: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  const uc = FIELD_MID * W
  if (!g.corners) {
    // A rosette on the mitre with a leaf running out along each rail.
    let h = rosette(x, u, uc, uc, 0.17 * W, 8, D)
    h = Math.max(h, leaf(x, u, uc - 0.1 * W, uc, Math.PI, leafShape(g, edge.corner + uc - 0.14 * W, 0.17 * W, 0, 0.88 * D)))
    return h
  }

  // The leg: a scroll with its rosette, standing back to back with the first repeat.
  let h = scroll(x + edge.corner - (SCROLL_EXTENT + 0.012) * W, u, g)

  // Great leaves sweeping from under the shell along the rail, three deep.
  h = Math.max(h, leaf(x, u, 0.2 * W, 0.5 * W, Math.PI + 0.02, leafShape(g, 0.82 * W, 0.17 * W, 0.05, 0.94 * D)))
  h = Math.max(h, leaf(x, u, 0.24 * W, 0.36 * W, Math.PI + 0.1, leafShape(g, 0.5 * W, 0.1 * W, 0.2, 0.8 * D)))
  h = Math.max(h, leaf(x, u, 0.1 * W, 0.69 * W, Math.PI - 0.04, leafShape(g, 0.52 * W, 0.095 * W, -0.16, 0.8 * D)))

  // The knuckle the shell hinges on.
  h = Math.max(h, D * dome(x, u, 0.262 * W, 0.262 * W, Math.max(1.4, 0.07 * W)))
  return h
}

/**
 * The shell across the mitre. It is the one thing allowed out of the field:
 * its rim rides up over the outer fillet, as far as the rope.
 */
function cornerShell(x: number, u: number, g: OrnamentGeometry): number {
  const W = g.width
  if (u > 0.85 * W || u < 0.2 * W) return 0
  const c = 0.27 * W
  const h = shell(x, u, c, c, Math.PI / 4, 1.0, 0.67 * W, 7 + 2 * Math.round(2 * g.detail), g.depth)
  return h * smoothstep(0.848 * W, 0.848 * W - 0.6, u) * smoothstep(FIELD_LO * W, FIELD_LO * W + 0.6, u)
}
