import type { BuildPlate, Vec2 } from '../types.ts'
import type { MiterFrame } from '../shapes.ts'
import type { OpeningPath } from '../shapes.ts'
import { fitsOnPlate, minAreaRect } from './packing.ts'

export interface SegmentPlan {
  /** Path vertex indices belonging to this run, in order. */
  indices: number[]
  /** Footprint of the run once laid flat, for the UI. */
  footprint: { width: number; height: number }
}

export interface SplitPlan {
  segments: SegmentPlan[]
  /** Path vertex indices where two segments meet and need a joint. */
  seams: number[]
  /** True when the whole frame prints in one piece. */
  single: boolean
  notes: string[]
  warnings: string[]
}

const MAX_SEGMENTS = 64

/**
 * Decide how to cut a frame into printable pieces.
 *
 * Seams are placed at the frame's own mitres first, because a corner is where a
 * joint is least visible and where the geometry is thickest. Runs that are
 * still too long are bisected until every piece fits the bed.
 */
export function planSplit(
  path: OpeningPath,
  frames: MiterFrame[],
  profileWidth: number,
  plate: BuildPlate,
  /**
   * Extra length to budget for joint hardware. A snap tenon sticks out past the
   * seam it belongs to, so a run that fits the bed on paper can overhang it once
   * the joint is on.
   */
  jointAllowance = 0,
): SplitPlan {
  const notes: string[] = []
  const warnings: string[] = []
  const n = path.points.length

  const footprintOf = (indices: number[]) => runFootprint(path, frames, profileWidth, indices, jointAllowance)

  const allIndices = Array.from({ length: n }, (_, i) => i)
  const whole = footprintOf(allIndices)
  if (fitsOnPlate(whole.width, whole.height, plate.x, plate.y, plate.smartOrientation)) {
    notes.push(
      `Whole frame fits the bed at ${whole.width.toFixed(0)} × ${whole.height.toFixed(0)} mm — printing in one piece.`,
    )
    return {
      segments: [{ indices: allIndices, footprint: whole }],
      seams: [],
      single: true,
      notes,
      warnings,
    }
  }

  // Start at the frame's own corners; a smooth shape gets four seams to begin.
  let seams = path.sharp.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
  if (seams.length < 2) seams = [0, 1, 2, 3].map((k) => Math.round((k * n) / 4))
  seams.sort((a, b) => a - b)

  for (let round = 0; round < 8; round++) {
    const runs = runsBetween(seams, n)
    const tooLong = runs.filter((run) => {
      const { width, height } = footprintOf(run)
      return !fitsOnPlate(width, height, plate.x, plate.y, plate.smartOrientation)
    })
    if (!tooLong.length) break
    if (seams.length * 2 > MAX_SEGMENTS) {
      warnings.push(
        'This frame needs more pieces than the generator will split it into. Try a larger bed, a narrower moulding, or a smaller opening.',
      )
      break
    }
    // Bisect every run that still overhangs the bed.
    const added: number[] = []
    for (const run of tooLong) {
      const mid = run[Math.floor(run.length / 2)]
      if (!seams.includes(mid)) added.push(mid)
    }
    if (!added.length) {
      warnings.push('A single segment is already larger than the bed — reduce the moulding width or depth.')
      break
    }
    seams = [...seams, ...added].sort((a, b) => a - b)
  }

  const segments = runsBetween(seams, n).map((indices) => ({
    indices,
    footprint: footprintOf(indices),
  }))

  const biggest = segments.reduce((a, s) => Math.max(a, s.footprint.width), 0)
  notes.push(
    `Split into ${segments.length} segments across ${seams.length} seams. Longest piece ${biggest.toFixed(0)} mm.`,
  )
  if (plate.smartOrientation && biggest > Math.max(plate.x, plate.y)) {
    notes.push('Smart Orientation is placing the longest pieces diagonally on the bed.')
  }

  return { segments, seams, single: false, notes, warnings }
}

/** The flat footprint of a run of path vertices, with room for its joint. */
export function runFootprint(
  path: OpeningPath,
  frames: MiterFrame[],
  profileWidth: number,
  indices: number[],
  jointAllowance = 0,
): { width: number; height: number } {
  const pts: Vec2[] = []
  for (const j of indices) {
    const [px, py] = path.points[j]
    const { dir, scale } = frames[j]
    pts.push([px, py])
    pts.push([px + dir[0] * scale * profileWidth, py + dir[1] * scale * profileWidth])
  }
  const rect = minAreaRect(pts)
  return { width: rect.width + jointAllowance, height: rect.height }
}

/**
 * Split an ornamented frame into four matching corner pieces and as few
 * straight pieces as the bed allows.
 *
 * Seams may only fall on repeat boundaries, where the carving is at its
 * plainest, and never on a mitre, so no corner flourish is ever cut. Every
 * corner piece reaches the same number of whole repeats along each rail, which
 * is what makes the four of them match; the straights between them are split
 * into runs of as equal a number of repeats as will fit, so an awkward size
 * comes out as a few slightly shorter fillers instead of one stub.
 *
 * Returns null when even a corner with no repeats will not fit the bed, and
 * the caller falls back to the ordinary mitre-first split.
 */
export function planOrnamentSplit(
  path: OpeningPath & { seamable: boolean[]; edge: number[] },
  frames: MiterFrame[],
  profileWidth: number,
  plate: BuildPlate,
  jointAllowance = 0,
): SplitPlan | null {
  const n = path.points.length
  const fits = (indices: number[]) => {
    const { width, height } = runFootprint(path, frames, profileWidth, indices, jointAllowance)
    return fitsOnPlate(width, height, plate.x, plate.y, plate.smartOrientation)
  }
  const all = Array.from({ length: n }, (_, i) => i)
  const whole = runFootprint(path, frames, profileWidth, all, jointAllowance)
  if (fitsOnPlate(whole.width, whole.height, plate.x, plate.y, plate.smartOrientation)) {
    return {
      segments: [{ indices: all, footprint: whole }],
      seams: [],
      single: true,
      notes: [`Whole frame fits the bed at ${whole.width.toFixed(0)} × ${whole.height.toFixed(0)} mm — printing in one piece, carving unbroken.`],
      warnings: [],
    }
  }

  // Seam candidates on each rail, in order from its start corner.
  const candidates: number[][] = [[], [], [], []]
  for (let j = 0; j < n; j++) if (path.seamable[j]) candidates[path.edge[j]].push(j)
  const corners = path.sharp.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
  if (corners.length !== 4 || candidates.some((c) => !c.length)) return null

  const span = (from: number, to: number) => {
    const out: number[] = []
    for (let i = from; ; i = (i + 1) % n) {
      out.push(i)
      if (i === to) break
    }
    return out
  }
  // Corner c sits at the start of rail c; its piece runs from the k-th
  // candidate from the end of the previous rail to the k-th on this one.
  const cornerRun = (c: number, k: number) => {
    const prev = candidates[(c + 3) % 4]
    return span(prev[prev.length - 1 - k], candidates[c][k])
  }
  const maxK = Math.min(...candidates.map((c) => Math.floor((c.length - 1) / 2)))
  let k = -1
  for (let t = maxK; t >= 0; t--) {
    if ([0, 1, 2, 3].every((c) => fits(cornerRun(c, t)))) {
      k = t
      break
    }
  }
  if (k < 0) return null

  const seams = new Set<number>()
  const warnings: string[] = []
  let straights = 0
  for (let e = 0; e < 4; e++) {
    const c = candidates[e]
    const lo = k
    const hi = c.length - 1 - k
    seams.add(c[lo])
    seams.add(c[hi])
    if (hi <= lo) continue
    // Fewest groups of repeats that each fit, as evenly sized as possible.
    let groups = 1
    for (; groups <= hi - lo; groups++) {
      const cuts = Array.from({ length: groups + 1 }, (_, g) => lo + Math.round((g * (hi - lo)) / groups))
      if (cuts.slice(1).every((cut, g) => fits(span(c[cuts[g]], c[cut])))) {
        for (const cut of cuts) seams.add(c[cut])
        break
      }
    }
    if (groups > hi - lo) {
      for (let i = lo; i <= hi; i++) seams.add(c[i])
      warnings.push('A single repeat of the ornament is longer than the bed. Reduce the repeat length or the moulding width.')
    }
    straights += Math.min(groups, hi - lo)
  }

  const sorted = [...seams].sort((a, b) => a - b)
  const segments = runsBetween(sorted, n).map((indices) => ({
    indices,
    footprint: runFootprint(path, frames, profileWidth, indices, jointAllowance),
  }))
  const biggest = segments.reduce((a, s) => Math.max(a, s.footprint.width), 0)
  return {
    segments,
    seams: sorted,
    single: false,
    notes: [
      `Split into 4 matching corner pieces${k ? `, each reaching ${k} ${k === 1 ? 'repeat' : 'repeats'} along both rails` : ''}${straights ? ` and ${straights} straight ${straights === 1 ? 'piece' : 'pieces'}` : ''}. Seams fall between repeats, so no motif is cut. Longest piece ${biggest.toFixed(0)} mm.`,
    ],
    warnings,
  }
}

/**
 * The vertex runs between consecutive seams, wrapping around the closed path.
 * Both endpoints are included in each run so neighbouring segments meet exactly
 * on the seam plane.
 */
export function runsBetween(seams: number[], n: number): number[][] {
  const runs: number[][] = []
  for (let k = 0; k < seams.length; k++) {
    const from = seams[k]
    const to = seams[(k + 1) % seams.length]
    const indices: number[] = []
    let i = from
    for (let guard = 0; guard <= n; guard++) {
      indices.push(i)
      if (i === to && indices.length > 1) break
      i = (i + 1) % n
    }
    runs.push(indices)
  }
  return runs
}
