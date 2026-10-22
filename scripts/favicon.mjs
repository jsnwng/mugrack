// node scripts/favicon.mjs: draws the mark, a glass mug on a strip of rack, and writes public/favicon.svg
// (square for square) and public/favicon.png (32 px, each pixel doubled, nearest-neighbour). No dependencies.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// one character per pixel, '.' transparent. The handle hangs past the plate's end, like the real thing.
const MAP = [
  '................',
  '................',
  '..oooooooooo....',
  '..owhgggggfo....',
  '..owhgggggfoooo.',
  '..owhgggggfo..o.',
  '..owhgggggfo..o.',
  '..owhgggggfo..o.',
  '..owhgggggfo..o.',
  '..owhgggggfoooo.',
  '..owhgggggfo....',
  '..ohggggggfo....',
  '..oooooooooo....',
  '.tttttttttttt...',
  '.TTTTTTTTTTTT...',
  '................',
]

const COLORS = {
  o: '#28363b', // outline, dark enough to hold on a light tab and a dark one
  w: '#ffffff', // the bright edge of the glass
  h: '#e9f1f3', // frosted glass
  g: '#cddadf',
  f: '#aebec4', // the far side, in shade
  t: '#35b3a7', // the rack, PETG teal
  T: '#1f7f76',
}

const size = MAP.length
for (const row of MAP) if (row.length !== size) throw new Error(`row "${row}" is not ${size} wide`)

// svg: one rect per run of a colour along a row
let rects = ''
MAP.forEach((row, y) => {
  for (let x = 0; x < size; ) {
    const c = row[x]
    let end = x + 1
    while (end < size && row[end] === c) end++
    if (c !== '.') rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${COLORS[c]}"/>`
    x = end
  }
})
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>\n`
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg)

// png: RGBA, scaled 2x
const SCALE = 2
const px = size * SCALE
const raw = Buffer.alloc((px * 4 + 1) * px)
for (let y = 0; y < px; y++) {
  raw[y * (px * 4 + 1)] = 0 // filter: none
  for (let x = 0; x < px; x++) {
    const c = MAP[Math.floor(y / SCALE)][Math.floor(x / SCALE)]
    const o = y * (px * 4 + 1) + 1 + x * 4
    if (c === '.') continue
    const hex = COLORS[c]
    raw[o] = parseInt(hex.slice(1, 3), 16)
    raw[o + 1] = parseInt(hex.slice(3, 5), 16)
    raw[o + 2] = parseInt(hex.slice(5, 7), 16)
    raw[o + 3] = 255
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(px, 0)
ihdr.writeUInt32BE(px, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../public/favicon.png', import.meta.url), png)
console.log(`wrote favicon.svg (${svg.length} bytes) and favicon.png (${px}x${px}, ${png.length} bytes)`)
