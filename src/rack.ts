// Rack dimensions, mirrored from make_stl.py (the source of truth). All mm, plate in the x/y plane, z up.
// Fixed design constants are plain exports; anything that follows the mug comes out of rack().

export const IN = 25.4

// rack (fixed)
export const T = 0.25 * IN // plate thickness 6.35
export const BAR_FRAME = 0.5 * IN
export const BAR_LAT = 0.4 * IN
export const COLLAR_H = 0.45 * IN // 11.43 above the plate top
export const RING_H = T + COLLAR_H
export const POST = 0.5 * IN // post square 12.7
export const BOSS = 17.0
export const BOSS_H = 30.0
export const SOCK_DEPTH = 20.0
export const RECESS_D = 3.0
export const SOCK = 12.8
export const POST_Z0 = BOSS_H - SOCK_DEPTH // a post stands on the socket floor

export const BED = 256 // print bed edge, Bambu P2S

export interface Mug {
  rim: number
  base: number
  height: number
  handle: number // reach from the wall
  gap: number // between neighbouring mugs
}

// the author's CREATIVELAND 16 oz glass
export const DEFAULT_MUG: Mug = { rim: 3.25 * IN, base: 3.25 * IN, height: 5.5 * IN, handle: 1.75 * IN, gap: 0.5 * IN }

export interface Cooler {
  width: number
  depth: number
  height: number
  hump: boolean // a step across the full depth at the +x end, like a compressor hump
  humpHeight: number
  humpDepth: number // how far it reaches in from that wall
}

// Midea 3.5 cu ft chest freezer, inside; its hump is off by default but keeps its measured size
export const DEFAULT_COOLER: Cooler = {
  width: 17.7 * IN, depth: 13.4 * IN, height: 27.9 * IN, hump: false, humpHeight: 8 * IN, humpDepth: 7.25 * IN,
}

export interface Rack {
  mug: Mug
  pitch: number // mug centre to centre, 95.25 by default
  collarIn: number // mug seat radius
  collarOut: number
  tier: number // plate underside to plate underside, 158.75 by default
  postLen: number // 151.75 by default
}

export function rack(mug: Mug): Rack {
  const collarIn = mug.base / 2 + 0.1 * IN
  const tier = T + mug.height + 0.5 * IN
  return {
    mug,
    pitch: mug.rim + mug.gap,
    collarIn,
    collarOut: collarIn + 0.25 * IN,
    tier,
    postLen: tier + RECESS_D - (BOSS_H - SOCK_DEPTH),
  }
}

export interface Plate {
  nx: number
  nz: number
  hx: number // half size along x
  hz: number // half size along z
  xs: number[] // mug centres
  zs: number[]
  posts: [number, number][]
}

export function plate(r: Rack, nx: number, nz: number): Plate {
  const { pitch } = r
  const xs = Array.from({ length: nx }, (_, i) => (i - (nx - 1) / 2) * pitch)
  const zs = Array.from({ length: nz }, (_, i) => (i - (nz - 1) / 2) * pitch)
  const Fx = ((nx - 1) * pitch) / 2 + r.mug.rim / 2 + 0.45 * IN
  const Fz = ((nz - 1) * pitch) / 2 + r.mug.rim / 2 + 0.45 * IN
  const hx = Fx + BAR_FRAME / 2
  const hz = Fz + BAR_FRAME / 2
  const o = BOSS / 2
  // full plate: four posts at the edge midpoints. half plate (v3): four corners plus the two x-edge midpoints.
  const posts: [number, number][] =
    nx === 2
      ? [[hx - o, 0], [-(hx - o), 0], [0, hz - o], [0, -(hz - o)]]
      : [[hx - o, 0], [-(hx - o), 0], [hx - o, hz - o], [-(hx - o), hz - o], [hx - o, -(hz - o)], [-(hx - o), -(hz - o)]]
  return { nx, nz, hx, hz, xs, zs, posts }
}
