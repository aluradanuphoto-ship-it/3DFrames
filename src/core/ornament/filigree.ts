import type { EdgeLayout, OrnamentGeometry } from './layout.ts'
import { smoothstep } from './primitives.ts'

/**
 * Filigree scrollwork.
 *
 * Not carving but line work: scrolls, tendrils and buds drawn as raised lines
 * of one height on a flat ground, inside a raised rim — the look of pressed
 * metal or a cast escutcheon. Because there are only two levels it prints
 * quickly, and a filament change at the top of the ground gives the lines a
 * second colour.
 *
 * The drawing is a set of strokes, each a polyline with a width, authored in
 * units of the moulding width so it scales with the frame. A corner and half a
 * repeat are drawn once; every other part of the frame is one of those two,
 * mirrored. Strokes reach a zone boundary only at fixed heights and square to
 * it, which is what lets a repeat, its neighbour and a corner join into one
 * unbroken line.
 */

type Pt = [number, number]

/** The rim either side, as a fraction of the moulding width. */
const RIM = 0.055
/** Where the two vines cross from one zone into the next. */
const LINK_HI = 0.84
const LINK_LO = 0.16
/** Cell size of the lookup grid, in moulding widths. */
const CELL = 0.07
/** Widest any stroke gets, as a multiple of the nominal half-width. */
const MAX_WEIGHT = 1.7

/** A set of strokes with a grid over them, so a lookup only tests what is near. */
class Drawing {
  private segs: number[] = []
  private grid = new Map<number, number[]>()

  /** Add a polyline whose weight runs from `w0` at its start to `w1` at its end. */
  stroke(points: Pt[], w0 = 1, w1 = w0): this {
    const n = points.length - 1
    for (let i = 0; i < Math.max(1, n); i++) {
      const a = points[i]
      const b = points[Math.min(n, i + 1)]
      const index = this.segs.length / 6
      this.segs.push(a[0], a[1], b[0], b[1], w0 + ((w1 - w0) * i) / Math.max(1, n), w0 + ((w1 - w0) * (i + 1)) / Math.max(1, n))
      const pad = 0.035 * MAX_WEIGHT
      const i0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL)
      const i1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL)
      const j0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL)
      const j1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL)
      for (let ci = i0; ci <= i1; ci++) {
        for (let cj = j0; cj <= j1; cj++) {
          const key = ci * 4096 + cj
          const cell = this.grid.get(key)
          if (cell) cell.push(index)
          else this.grid.set(key, [index])
        }
      }
    }
    return this
  }

  /** A round dot. */
  dot(at: Pt, weight: number): this {
    return this.stroke([at, at], weight)
  }

  /**
   * Distance from a point to the edge of the nearest stroke, negative inside
   * it. `half` is the nominal half-width of a stroke.
   */
  edge(x: number, y: number, half: number): number {
    const cell = this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL))
    if (!cell) return 1
    let best = 1
    const s = this.segs
    for (const index of cell) {
      const o = index * 6
      const ax = s[o], ay = s[o + 1]
      const dx = s[o + 2] - ax, dy = s[o + 3] - ay
      const len2 = dx * dx + dy * dy
      const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t) - half * (s[o + 4] + (s[o + 5] - s[o + 4]) * t)
      if (d < best) best = d
    }
    return best
  }
}

/** A cubic Bézier as a polyline. */
function curve(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 18): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const m = 1 - t
    const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]])
  }
  return out
}

/**
 * A scroll: a spiral that starts on radius `R` at angle `from` (degrees) and
 * winds inward `turns` times. `hand` +1 winds counter-clockwise.
 */
function spiral(cx: number, cy: number, R: number, from: number, turns: number, hand: 1 | -1, eye = 0.12): Pt[] {
  const out: Pt[] = []
  const n = Math.ceil(turns * 26)
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const r = R * (eye + (1 - eye) * Math.pow(1 - f, 0.85))
    const a = (from * Math.PI) / 180 + hand * f * turns * 2 * Math.PI
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

/** Where a zone ends: the vines pass through, with a lozenge between them. */
function boundary(D: Drawing, xb: number): void {
  D.stroke([[xb, 0.37], [xb + 0.055, 0.5], [xb, 0.63]], 0.9)
  D.dot([xb, 0.5], 1.5)
  D.dot([xb, 0.275], 1.1)
  D.dot([xb, 0.725], 1.1)
}

/** Half the length of the repeat's own drawing; beyond it only the vines run on. */
const MOTIF_HALF = 0.69

/**
 * Half a repeat, for x ≤ 0 with the repeat's centre at x = 0 and its boundary
 * at x = −pitch/2. The other half is its mirror image.
 *
 * A stem rises from the foot of the centre line and rolls up into a great
 * scroll; a branch leaves it for a lesser scroll below. On the centre line,
 * between the mirrored pair, stand an almond and a crest of two curls. A vine
 * leaves each scroll for the boundary. Every line springs from another, and
 * only the vines change length with the pitch — where they run long, each
 * throws a curl of its own into the gap.
 */
function repeatDrawing(pitch: number, detail: number): Drawing {
  const D = new Drawing()
  const xb = -pitch / 2
  const end = Math.max(xb, -MOTIF_HALF)

  // Stem and the great scroll.
  D.stroke(curve([0, 0.16], [-0.02, 0.3], [-0.2, 0.33], [-0.36, 0.33]), 1.2, 1)
  D.stroke(spiral(-0.36, 0.56, 0.23, -90, 2, -1))
  // Branch and the lesser scroll.
  D.stroke(curve([-0.27, 0.327], [-0.39, 0.26], [-0.48, 0.295], [-0.57, 0.295]))
  D.stroke(spiral(-0.57, 0.215, 0.08, 90, 1.4, 1, 0.18))
  // The foot curls away under the stem.
  D.stroke(curve([0, 0.16], [-0.05, 0.115], [-0.12, 0.125], [-0.15, 0.165]), 1.2, 1)
  D.stroke(spiral(-0.15, 0.205, 0.04, -90, 1.1, -1, 0.22))

  // Centre line: an almond, and a crest of two curls above it.
  D.stroke(curve([0, 0.36], [-0.085, 0.45], [-0.085, 0.6], [0, 0.7]), 0.95)
  D.stroke(curve([0, 0.7], [-0.02, 0.8], [-0.08, 0.875], [-0.15, 0.865]))
  D.stroke(spiral(-0.15, 0.825, 0.04, 90, 1.1, 1, 0.22))

  // The vines that run on to the next zone, leaving each scroll at a tangent.
  D.stroke(curve([-0.568, 0.58], [-0.575, 0.74], [-0.6, LINK_HI], [end, LINK_HI]))
  D.stroke(curve([-0.65, 0.225], [-0.655, 0.175], [-0.665, LINK_LO], [end, LINK_LO]))
  D.stroke([[end, LINK_HI], [xb, LINK_HI]])
  D.stroke([[end, LINK_LO], [xb, LINK_LO]])
  boundary(D, xb)

  // Slack in the layout: each vine throws a curl into the gap.
  const gap = end - xb
  if (gap >= 0.16) {
    const r = Math.min(0.14, gap * 0.42)
    const xm = xb + gap * 0.5
    D.stroke(spiral(xm, LINK_HI - r, r, 90, 1.6, 1, 0.16))
    D.stroke(spiral(xm, LINK_LO + r, r, -90, 1.6, -1, 0.16))
  }

  if (detail >= 0.4) D.dot([0, 0.53], 1.8)
  if (detail >= 0.7) {
    D.dot([-0.36, 0.56], 1.5)
    D.dot([-0.57, 0.215], 1.2)
    D.stroke(curve([-0.1, 0.3], [-0.14, 0.24], [-0.2, 0.22], [-0.26, 0.24]), 1, 0.4)
  }
  return D
}

/**
 * A corner, in coordinates where x runs toward the mitre and the mitre is the
 * line x = u. Only the half x ≤ u is drawn; the other is its mirror image.
 * The zone begins at x = −length.
 *
 * Both vines arrive from the rail and roll up into scrolls on the leg. On the
 * mitre a stem comes in from the outer corner and rolls up beside it; with
 * its mirror image that makes a heart pointing into the corner, with a dart
 * and a bud inside it.
 */
function cornerDrawing(length: number, flourish: boolean, detail: number): Drawing {
  const D = new Drawing()
  const xb = -length
  boundary(D, xb)

  // The outer vine, into a scroll on the leg.
  D.stroke(curve([xb, LINK_HI], [xb + 0.15, LINK_HI], [-0.5, 0.82], [-0.3, 0.82]))
  D.stroke(spiral(-0.3, 0.62, 0.2, 90, 1.9, -1))

  if (flourish) {
    // The inner vine, into a scroll further out along the leg…
    D.stroke(curve([xb, LINK_LO], [xb + 0.12, LINK_LO], [-0.9, 0.18], [-0.78, 0.18]))
    D.stroke(spiral(-0.78, 0.38, 0.2, -90, 1.9, 1))
    // …with a branch running on to a curl by the sight corner.
    D.stroke(curve([-0.84, 0.184], [-0.55, 0.09], [-0.2, 0.12], [0, 0.14]))
    // And the outer vine throws a curl back over it.
    D.stroke(spiral(-0.86, LINK_HI - 0.085, 0.08, 90, 1.4, 1, 0.18))
  } else {
    D.stroke(curve([xb, LINK_LO], [xb + 0.15, LINK_LO], [-0.25, 0.12], [0, 0.14]))
  }
  D.stroke(spiral(0, 0.24, 0.1, -90, 1.6, 1, 0.16))

  // The heart on the mitre.
  D.stroke(curve([0.85, 0.85], [0.66, 0.91], [0.44, 0.8], [0.26, 0.8]), 1.2, 1)
  D.stroke(spiral(0.26, 0.6, 0.2, 90, 1.9, 1))
  D.stroke([[0.18, 0.18], [0.36, 0.36]], 0.5, 1.3)
  D.dot([0.45, 0.45], 1.8)

  if (detail >= 0.4) {
    // A tendril between the heart and the scroll on the leg.
    D.stroke(curve([-0.02, 0.8], [-0.06, 0.72], [-0.06, 0.62], [-0.01, 0.54]), 1, 0.4)
  }
  if (detail >= 0.7) {
    D.dot([-0.3, 0.62], 1.5)
    D.dot([0.26, 0.6], 1.5)
    if (flourish) D.dot([-0.78, 0.38], 1.5)
  }
  return D
}

/** A rail too short for a repeat: the vines simply run across between the corners. */
function bridgeDrawing(half: number): Drawing {
  const D = new Drawing()
  D.stroke([[-half, LINK_HI], [0, LINK_HI]])
  D.stroke([[-half, LINK_LO], [0, LINK_LO]])
  boundary(D, -half)
  if (half > 0.12) {
    D.dot([0, 0.5], 1.7)
    D.stroke([[-Math.min(0.09, half * 0.6), 0.5], [0, 0.66]], 0.9)
    D.stroke([[-Math.min(0.09, half * 0.6), 0.5], [0, 0.34]], 0.9)
  }
  return D
}

const cache = new Map<string, Drawing>()
function drawing(key: string, make: () => Drawing): Drawing {
  let found = cache.get(key)
  if (!found) {
    if (cache.size > 24) cache.clear()
    found = make()
    cache.set(key, found)
  }
  return found
}

export function filigree(d: number, u: number, edge: EdgeLayout, g: OrnamentGeometry): number {
  const W = g.width
  const D = g.depth
  if (D <= 0) return 0
  // Sides slope just enough for the sampling grid to carry a clean edge.
  const soft = Math.min(0.3, D * 0.5) / W
  const un = u / W

  // The rim, either side.
  const rim = Math.max(un - (1 - RIM), RIM - un)
  if (rim > soft) return D
  let cover = smoothstep(-soft, soft, rim)

  const half = Math.max(0.55 / W, 0.0125)
  const detail = Math.round(g.detail * 20) / 20
  let line: number
  if (d < edge.corner) {
    const key = `c|${(g.corner / W).toFixed(4)}|${g.corners}|${detail}`
    line = drawing(key, () => cornerDrawing(g.corner / W, g.corners, detail)).edge(-d / W, un, half)
  } else if (edge.count === 0) {
    const gap = (edge.length / 2 - edge.corner) / W
    line = drawing(`b|${gap.toFixed(4)}`, () => bridgeDrawing(gap)).edge((d - edge.length / 2) / W, un, half)
  } else {
    const q = d - edge.corner
    const k = Math.min(edge.count - 1, Math.max(0, Math.floor(q / edge.pitch)))
    const t = q - (k + 0.5) * edge.pitch
    const pitch = edge.pitch / W
    line = drawing(`r|${pitch.toFixed(4)}|${detail}`, () => repeatDrawing(pitch, detail)).edge(-Math.abs(t) / W, un, half)
  }
  cover = Math.max(cover, smoothstep(soft, -soft, line))
  return D * cover
}
