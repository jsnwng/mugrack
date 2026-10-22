// npm run check: builds every part with the JS port and compares it against make_stl.py's output, recorded in
// make_stl.ref.json (volume, triangle count and extents, from `python make_stl.py` with manifold3d 3.5.4 and
// trimesh's stats). Both sides run the same manifold version, so they should agree to the triangle.
// It also reads back each STL the export writes, to check its size, winding and volume.
import { readFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { geometry, stl, type Part } from '../src/geometry'
import { DEFAULT_MUG, SOCK, rack } from '../src/rack'

const ref: Record<string, { volume: number; tris: number; size: number[] }> = JSON.parse(
  readFileSync(new URL('./make_stl.ref.json', import.meta.url), 'utf8'),
)

const wasm = await Module()
wasm.setup()
const g = geometry(wasm)
const r = rack(DEFAULT_MUG)

// volume of a binary STL by the divergence theorem, and how many facets' normals disagree with their winding
function readBack(buf: ArrayBuffer) {
  const v = new DataView(buf)
  const n = v.getUint32(80, true)
  let volume = 0
  let flipped = 0
  for (let t = 0; t < n; t++) {
    const f = (i: number) => v.getFloat32(84 + t * 50 + i * 4, true)
    const [a, b, c] = [3, 6, 9].map((i) => [f(i), f(i + 1), f(i + 2)])
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const h = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [e[1] * h[2] - e[2] * h[1], e[2] * h[0] - e[0] * h[2], e[0] * h[1] - e[1] * h[0]]
    if (cross[0] * f(0) + cross[1] * f(1) + cross[2] * f(2) < 0) flipped++
  }
  return { volume, flipped, whole: buf.byteLength === 84 + n * 50 }
}

const parts: [string, Part][] = [
  ['rack_plate_full_2x2', g.part(g.plate(r, 2, 2, SOCK))],
  ['rack_plate_half_1x2', g.part(g.plate(r, 1, 2, SOCK))],
  ['rack_post', g.part(g.post(r.postLen))],
  ['fit_test_post_stub', g.part(g.post(60))],
  ['fit_test_sockets', g.part(g.coupon([12.7, 12.8, 12.9, 13.0, 13.1]))],
]

let bad = 0
for (const [name, p] of parts) {
  const want = ref[name]
  const back = readBack(stl(p.mesh, name))
  const problems = [
    Math.abs(p.volume - want.volume) / want.volume > 1e-6 && `volume ${p.volume.toFixed(1)} vs ${want.volume}`,
    p.tris !== want.tris && `tris ${p.tris} vs ${want.tris}`,
    p.size.some((s, i) => Math.abs(s - want.size[i]) > 1e-3) && `size ${p.size.map((s) => s.toFixed(3))} vs ${want.size}`,
    !back.whole && 'stl length',
    back.flipped > 0 && `${back.flipped} flipped facets`,
    Math.abs(back.volume - p.volume) / p.volume > 1e-4 && `stl volume ${back.volume.toFixed(1)}`,
  ].filter(Boolean)
  if (problems.length) bad++
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}  ${(p.volume / 1000).toFixed(1)} cm3  ${p.tris} tris  ${p.size.map((s) => s.toFixed(1)).join(' x ')} mm${problems.length ? '  ' + problems.join(', ') : ''}`)
}
console.log(`post length ${r.postLen.toFixed(2)} (expect 151.75), tier ${r.tier.toFixed(2)} (expect 158.75)`)
if (Math.abs(r.postLen - 151.75) > 1e-9 || Math.abs(r.tier - 158.75) > 1e-9) bad++
if (bad) {
  console.log(`${bad} check(s) failed`)
  process.exit(1)
}
console.log('the port matches make_stl.py')
