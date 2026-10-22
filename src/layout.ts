// Where towers go in the cooler: full 2 × 2 towers packed from the -x wall and the back wall, then a row of half
// towers in whatever depth is left, on the flat floor and again on top of the hump. Rough on purpose: no wall
// taper, no frost, every tower in a region gets the same number of tiers. Each tower's footprint includes the
// handles that reach past its plate, so handles never meet a neighbour's or a wall.
import { plate, type Cooler, type Rack } from './rack'

export const MARGIN = 25 // mm left free above a tower for frost and the lid
const CLEAR = 2 // mm between towers, and between a tower and a wall

export interface Placement {
  half: boolean // a 1 × 2 tower, turned so its long side runs along x
  x: number // tower centre on the floor, cooler centred on the origin
  z: number
  y: number // floor height under it (the hump top, or 0)
  tiers: number
}

export interface Layout {
  placements: Placement[]
  flat: number // length of flat floor before the hump
  tiersFlat: number
  tiersHump: number
  full: number // towers
  half: number
  mugs: number
  above: number // room over the flat-floor towers
  overFull: number // how far a full plate's handles reach past its edges (diagonally, out of the corners)
  overHalf: number // how far a half plate's handles reach past its ends
}

export function tiersUnder(r: Rack, room: number): number {
  return Math.max(0, Math.floor((room - MARGIN) / r.tier))
}

export function layout(r: Rack, c: Cooler): Layout {
  const { rim, handle } = r.mug
  const full = plate(r, 2, 2)
  const half = plate(r, 1, 2)
  // full plate: handles point diagonally into the corners, so a tip can poke past both edges there.
  // half plate: they point along its long side, out past both ends; across its short side they stay inside.
  const overFull = Math.max(0, r.pitch / 2 + (rim / 2 + handle) / Math.SQRT2 - full.hx)
  const overHalf = Math.max(0, r.pitch / 2 + rim / 2 + handle - half.hz)
  const fullFoot = 2 * (full.hx + overFull) + CLEAR
  const halfLong = 2 * (half.hz + overHalf) + CLEAR
  const halfWide = 2 * half.hx + CLEAR

  const humpDepth = c.hump && c.humpHeight > 0 ? Math.min(c.humpDepth, c.width) : 0
  const flat = c.width - humpDepth
  const placements: Placement[] = []

  const fill = (x0: number, length: number, y: number, tiers: number) => {
    if (tiers < 1) return
    const across = Math.floor(length / fullFoot)
    const deep = Math.floor(c.depth / fullFoot)
    for (let i = 0; i < across; i++) {
      for (let j = 0; j < deep; j++) {
        placements.push({ half: false, x: x0 + fullFoot * (i + 0.5), z: -c.depth / 2 + fullFoot * (j + 0.5), y, tiers })
      }
    }
    if (c.depth - deep * fullFoot >= halfWide) {
      const n = Math.floor(length / halfLong)
      for (let i = 0; i < n; i++) {
        placements.push({ half: true, x: x0 + halfLong * (i + 0.5), z: -c.depth / 2 + deep * fullFoot + halfWide / 2, y, tiers })
      }
    }
  }

  const tiersFlat = tiersUnder(r, c.height)
  const tiersHump = humpDepth > 0 ? tiersUnder(r, c.height - c.humpHeight) : 0
  fill(-c.width / 2, flat, 0, tiersFlat)
  if (humpDepth > 0) fill(c.width / 2 - humpDepth, humpDepth, c.humpHeight, tiersHump)

  const fullN = placements.filter((p) => !p.half).length
  const mugs = placements.reduce((n, p) => n + p.tiers * (p.half ? 2 : 4), 0)
  return {
    placements, flat, tiersFlat, tiersHump, full: fullN, half: placements.length - fullN, mugs,
    above: c.height - tiersFlat * r.tier, overFull, overHalf,
  }
}
