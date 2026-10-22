// The printable parts, ported line for line from make_stl.py onto manifold-3d (the same library, built for
// WASM). Python's frame: mm, Z up, print orientation; the second plate axis is Python's y.
// Every Manifold lives in WASM memory and must be deleted, so each builder runs in a scope that frees
// everything it made except what it returns.
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import {
  BAR_FRAME, BAR_LAT, BOSS, BOSS_H, POST, RECESS, RECESS_D, RING_H, SEG, SOCK_DEPTH, T, VENT_R, plate as layoutPlate,
  type Rack,
} from './rack'

export interface Mesh {
  positions: Float32Array // xyz per vertex
  indices: Uint32Array // three per triangle
}

export interface Part {
  mesh: Mesh
  volume: number // mm³
  tris: number
  size: [number, number, number] // extents, mm
}

export function geometry(wasm: ManifoldToplevel) {
  const { Manifold } = wasm

  // run fn with a fresh scope; everything made through the scope's helpers is freed afterwards except the result
  function scoped(fn: (s: Scope) => Manifold): Manifold {
    const made: Manifold[] = []
    const keep = <M extends Manifold>(m: M): M => (made.push(m), m)
    const s: Scope = {
      cube: (sx, sy, sz, cx, cy, z0) => keep(keep(Manifold.cube([sx, sy, sz], true)).translate([cx, cy, z0 + sz / 2])),
      cyl: (r, h, cx, cy, z0) => keep(keep(Manifold.cylinder(h, r, r, SEG)).translate([cx, cy, z0])),
      add: (a, b) => keep(a.add(b)),
      sub: (a, b) => keep(a.subtract(b)),
      keep,
    }
    const result = fn(s)
    for (const m of made) if (m !== result) m.delete()
    return result
  }

  function plate(r: Rack, nx: number, nz: number, sock: number): Manifold {
    const p = layoutPlate(r, nx, nz)
    return scoped(({ cube, cyl, add, sub }) => {
      const { hx, hz } = p
      const outer = cube(2 * hx, 2 * hz, T, 0, 0, 0)
      const inner = cube(2 * (hx - BAR_FRAME), 2 * (hz - BAR_FRAME), T + 2, 0, 0, -1)
      const parts = [sub(outer, inner)]
      const bxs = nx % 2 === 0 ? [...p.xs, 0] : p.xs
      const bzs = nz % 2 === 0 ? [...p.zs, 0] : p.zs
      for (const x of bxs) parts.push(cube(BAR_LAT, 2 * hz - 0.02, T, x, 0, 0))
      for (const z of bzs) parts.push(cube(2 * hx - 0.02, BAR_LAT, T, 0, z, 0))
      for (const x of p.xs) {
        for (const z of p.zs) parts.push(sub(cyl(r.collarOut, RING_H, x, z, 0), cyl(r.collarIn, RING_H + 2, x, z, -1)))
      }
      for (const [px, pz] of p.posts) parts.push(cube(BOSS, BOSS, BOSS_H, px, pz, 0))
      let body = parts[0]
      for (const part of parts.slice(1)) body = add(body, part)
      for (const [px, pz] of p.posts) {
        body = sub(body, cube(sock, sock, SOCK_DEPTH + 2, px, pz, BOSS_H - SOCK_DEPTH))
        body = sub(body, cube(RECESS, RECESS, RECESS_D + 1, px, pz, -1))
        // air vent: socket floor to underside recess
        body = sub(body, cyl(VENT_R, BOSS_H - SOCK_DEPTH + 1.0 - RECESS_D + 1.0, px, pz, RECESS_D - 0.5))
      }
      return body
    })
  }

  // one post, lying flat along X for printing
  function post(length: number): Manifold {
    return scoped(({ cube, keep }) => keep(keep(cube(POST, POST, length, 0, 0, 0).rotate([0, 90, 0])).translate([length / 2, 0, POST / 2])))
  }

  // the posts one plate needs, side by side on the bed
  function posts(length: number, n: number): Manifold {
    const pitch = POST + 8
    return scoped(({ add, keep }) => {
      const one = keep(post(length))
      let m = keep(one.translate([0, -((n - 1) / 2) * pitch, 0]))
      for (let i = 1; i < n; i++) m = add(m, keep(one.translate([0, (i - (n - 1) / 2) * pitch, 0])))
      return m
    })
  }

  // a strip of bosses with sockets around the chosen size, to find the fit before printing a whole rack
  function coupon(sizes: number[]): Manifold {
    const pitch = BOSS + 4
    const w = sizes.length * pitch
    const at = (i: number) => (i - (sizes.length - 1) / 2) * pitch
    return scoped(({ cube, add, sub }) => {
      let m = cube(w, BOSS + 6, T, 0, 0, 0)
      sizes.forEach((_, i) => (m = add(m, cube(BOSS, BOSS, BOSS_H, at(i), 0, 0))))
      sizes.forEach((s, i) => (m = sub(m, cube(s, s, SOCK_DEPTH + 2, at(i), 0, BOSS_H - SOCK_DEPTH))))
      return m
    })
  }

  // the coupon and a 60 mm post stub beside it, in one file
  function fitTest(sizes: number[]): Manifold {
    return scoped(({ add, keep }) => {
      const c = keep(coupon(sizes))
      const stub = keep(keep(post(60)).translate([-30, -(BOSS + 6) / 2 - 10 - POST / 2, 0]))
      return add(c, stub)
    })
  }

  // flatten into plain arrays and free the Manifold; extents come from the mesh, like trimesh's
  function part(m: Manifold): Part {
    const mesh = m.getMesh()
    const n = mesh.vertProperties.length / mesh.numProp
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k]
    const b = m.boundingBox()
    const out: Part = {
      mesh: { positions, indices: new Uint32Array(mesh.triVerts) },
      volume: m.volume(),
      tris: m.numTri(),
      size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]],
    }
    m.delete()
    return out
  }

  return { plate, post, posts, coupon, fitTest, part }
}

interface Scope {
  cube(sx: number, sy: number, sz: number, cx: number, cy: number, z0: number): Manifold
  cyl(r: number, h: number, cx: number, cy: number, z0: number): Manifold
  add(a: Manifold, b: Manifold): Manifold
  sub(a: Manifold, b: Manifold): Manifold
  keep<M extends Manifold>(m: M): M
}

// binary STL, centred on XY and sitting on z = 0 like make_stl.py's save()
export function stl(mesh: Mesh, name: string): ArrayBuffer {
  const { positions: p, indices } = mesh
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[i + k])
      hi[k] = Math.max(hi[k], p[i + k])
    }
  }
  const off = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]]
  const tris = indices.length / 3
  const buf = new ArrayBuffer(84 + tris * 50)
  const view = new DataView(buf)
  const header = `mugrack ${name}`.slice(0, 80)
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, tris, true)
  let o = 84
  const v = [0, 0, 0].map(() => [0, 0, 0])
  for (let t = 0; t < tris; t++) {
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) v[j][k] = p[indices[t * 3 + j] * 3 + k] + off[k]
    const ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2]
    const bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2]
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    for (const c of [nx, ny, nz]) (view.setFloat32(o, c, true), (o += 4))
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) (view.setFloat32(o, v[j][k], true), (o += 4))
    view.setUint16(o, 0, true)
    o += 2
  }
  return buf
}
