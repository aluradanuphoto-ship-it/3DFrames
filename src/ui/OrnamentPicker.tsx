import { useEffect, useRef } from 'react'
import type { OrnamentConfig, OrnamentStyle } from '../core/types.ts'
import { ORNAMENT_STYLES } from '../core/ornament/field.ts'
import { layoutOrnament } from '../core/ornament/layout.ts'
import { railCoords } from '../core/ornament/field.ts'

/**
 * Style choice with a rendered swatch of each: a corner and a little of both
 * rails, drawn from the same height field the geometry is built from, so the
 * swatch is exactly what will be printed.
 */
export function OrnamentPicker({
  value,
  config,
  onChange,
}: {
  value: OrnamentStyle
  config: OrnamentConfig
  onChange: (style: OrnamentStyle) => void
}) {
  return (
    <div className="field">
      <span className="legend">Style</span>
      <div className="ornament-picker" role="group" aria-label="Ornament style">
        {ORNAMENT_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            className="ornament-card"
            aria-pressed={style.id === value}
            onClick={() => onChange(style.id)}
            title={style.blurb}
          >
            <Swatch style={style.id} config={config} />
            <span>{style.label}</span>
          </button>
        ))}
      </div>
      <p className="hint">{ORNAMENT_STYLES.find((s) => s.id === value)?.blurb}</p>
    </div>
  )
}

const SWATCH_W = 132
const SWATCH_H = 72

function Swatch({ style, config }: { style: OrnamentStyle; config: OrnamentConfig }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fn = ORNAMENT_STYLES.find((s) => s.id === style)?.fn ?? null
  const { symmetry, corners, detail, spacing } = config

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const scale = 2
    canvas.width = SWATCH_W * scale
    canvas.height = SWATCH_H * scale
    const image = ctx.createImageData(canvas.width, canvas.height)

    // The bottom-right corner of a frame with a 60 mm moulding.
    const W = 60
    const geo = layoutOrnament(600, 400, W, { style, depth: 5, spacing, detail, corners, symmetry })
    const mmPerPx = (W * 2.4) / canvas.height
    const x0 = geo.hw + W - canvas.width * mmPerPx
    const y0 = -geo.hh - W
    const heightAt = (px: number, py: number) => {
      const x = x0 + px * mmPerPx
      const y = y0 + (canvas.height - py) * mmPerPx
      if (Math.abs(x) < geo.hw && Math.abs(y) < geo.hh) return -1
      const { d, u, a, edge } = railCoords(geo, x, y)
      return fn ? fn(d, u, edge, geo, a) : 0
    }
    const H = new Float32Array(canvas.width * canvas.height)
    for (let py = 0; py < canvas.height; py++) {
      for (let px = 0; px < canvas.width; px++) H[py * canvas.width + px] = heightAt(px, py)
    }
    const light = [-0.5, 0.6, 0.62]
    const norm = Math.hypot(...light)
    for (let py = 0; py < canvas.height; py++) {
      for (let px = 0; px < canvas.width; px++) {
        const i = py * canvas.width + px
        const o = i * 4
        if (H[i] < 0) {
          image.data[o + 3] = 0
          continue
        }
        const at = (qx: number, qy: number) => {
          const v = H[Math.min(canvas.height - 1, Math.max(0, qy)) * canvas.width + Math.min(canvas.width - 1, Math.max(0, qx))]
          return v < 0 ? H[i] : v
        }
        const hx = (at(px + 1, py) - at(px - 1, py)) / (2 * mmPerPx)
        const hy = (at(px, py - 1) - at(px, py + 1)) / (2 * mmPerPx)
        const n = Math.hypot(hx, hy, 1)
        const lit = Math.max(0, (-hx * light[0] - hy * light[1] + light[2]) / (n * norm))
        const shade = 0.2 + 0.8 * lit
        image.data[o] = 196 * shade
        image.data[o + 1] = 152 * shade
        image.data[o + 2] = 88 * shade
        image.data[o + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [fn, style, symmetry, corners, detail, spacing])

  return <canvas ref={ref} className="ornament-swatch" style={{ width: SWATCH_W, height: SWATCH_H }} aria-hidden="true" />
}
