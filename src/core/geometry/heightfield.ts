import type { ProfilePoint, Vec2 } from '../types.ts'
import type { MiterFrame } from '../shapes.ts'
import { MeshBuilder, type RawMesh } from './mesh.ts'
import { triangulatePolygon } from './triangulate.ts'

/**
 * A cross-section point for the height sweep. Points flagged `top` are on the
 * decorative face, and take their height from the surface function instead of
 * from `v`.
 */
export interface SectionPoint extends ProfilePoint {
  top: boolean
}

/** Smallest height a face point may have above the rabbet ceiling or back. */
const MIN_WALL_MM = 0.8

/**
 * The cross-section of an ornamented moulding: the rabbet and back exactly as
 * the profile has them, and a finely sampled face whose height comes from the
 * ornament. Face samples land on every vertex of the profile's own face as
 * well as on a regular spacing, so a crisp lip or bead in the profile stays
 * crisp under the carving.
 */
export function ornamentSection(profile: ProfilePoint[], step: number): SectionPoint[] {
  const back = profile.slice(0, 4).map((p) => ({ ...p, top: false }))
  const width = profile.reduce((m, p) => Math.max(m, p.u), 0)
  const us = new Set<number>()
  const n = Math.max(4, Math.ceil(width / step))
  for (let i = 0; i <= n; i++) us.add((width * i) / n)
  for (const p of profile.slice(4)) us.add(p.u)
  const sorted = [...us].sort((a, b) => b - a)
  const top: SectionPoint[] = []
  for (const u of sorted) {
    if (top.length && Math.abs(top[top.length - 1].u - u) < step * 0.3) continue
    top.push({ u, v: 0, top: true })
  }
  // The face has to end exactly on the sight edge and on the outer edge.
  top[0].u = width
  top[top.length - 1].u = 0
  return [...back, ...top]
}

export interface HeightSweepInput {
  /** Column base points, on the sight line. */
  points: Vec2[]
  /** Direction and stretch of each column, as from `ornamentPath`. */
  frames: MiterFrame[]
  section: SectionPoint[]
  /** Absolute height of the face at a plan point. */
  height: (x: number, y: number) => number
  /** True for a whole frame, false for a cut segment (which gets end caps). */
  closed: boolean
}

/**
 * Sweep a cross-section whose face is a height field.
 *
 * Exactly the construction `sweep` uses — one ring of vertices per column,
 * quads between neighbouring rings, flat caps on an open run — so the result
 * is watertight by construction. The difference is that the face is sampled
 * densely in both directions and its height is read from the plan position,
 * which is what lets carving run continuously round a mitre and across a seam.
 *
 * The back stays flat at z = 0 and the face can only rise, so the part prints
 * face up with no overhang anywhere except the rabbet ceiling, a bridge.
 */
export function heightSweep(input: HeightSweepInput): RawMesh {
  const { points, frames, section, height, closed } = input
  const nPath = points.length
  const nSec = section.length
  if (nPath < 2 || nSec < 3) return { vertProperties: new Float32Array(), triVerts: new Uint32Array() }

  // The face must stay clear of the rabbet ceiling and the back.
  const floor = section.reduce((m, p) => (p.top ? m : Math.max(m, p.v)), 0) + MIN_WALL_MM

  const builder = new MeshBuilder()
  const grid: number[][] = []
  const zs: number[][] = []
  for (let j = 0; j < nPath; j++) {
    const [px, py] = points[j]
    const { dir, scale } = frames[j]
    const row: number[] = []
    const rowZ: number[] = []
    for (let i = 0; i < nSec; i++) {
      const { u, v, top } = section[i]
      const x = px + dir[0] * scale * u
      const y = py + dir[1] * scale * u
      const z = top ? Math.max(floor, height(x, y)) : v
      row.push(builder.addVertex(x, y, z))
      rowZ.push(z)
    }
    grid.push(row)
    zs.push(rowZ)
  }

  const lastSpan = closed ? nPath : nPath - 1
  for (let j = 0; j < lastSpan; j++) {
    const a = grid[j]
    const b = grid[(j + 1) % nPath]
    for (let i = 0; i < nSec; i++) {
      const i2 = (i + 1) % nSec
      builder.addQuad(a[i], b[i], b[i2], a[i2])
    }
  }

  if (!closed) {
    // Each cap lies in the plane of its column; triangulate it in that plane.
    const cap = (j: number, reverse: boolean) => {
      const outline = section.map((p, i) => [p.u, zs[j][i]] as Vec2)
      const tris = triangulatePolygon(outline)
      for (let t = 0; t < tris.length; t += 3) {
        const [p, q, r] = [grid[j][tris[t]], grid[j][tris[t + 1]], grid[j][tris[t + 2]]]
        if (reverse) builder.addTriangle(r, q, p)
        else builder.addTriangle(p, q, r)
      }
    }
    cap(0, false)
    cap(nPath - 1, true)
  }
  return builder.build()
}
