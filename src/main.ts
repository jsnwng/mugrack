import './style.css'
import { stl, type Part } from './geometry'
import { layout, type Layout } from './layout'
import { loadGeometry, type Geometry } from './manifold'
import { BED, DEFAULT_COOLER, DEFAULT_MUG, SOCK, plate, rack, type Cooler, type Mug, type Rack } from './rack'
import { RackView, type Kind, type ViewMode } from './view'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const cooler: Cooler = { ...DEFAULT_COOLER }
const mug: Mug = { ...DEFAULT_MUG }
const fit = { socket: SOCK }
let mode: ViewMode = 'module'
let kind: Kind = 'full'

// one slider per dimension, all in mm
interface Dim<K extends string> {
  key: K
  label: string
  min: number
  max: number
  step: number
}
type CoolerDim = Exclude<keyof Cooler, 'hump'>
const COOLER_DIMS: Dim<CoolerDim>[] = [
  { key: 'width', label: 'width', min: 250, max: 1000, step: 0.5 },
  { key: 'depth', label: 'depth', min: 200, max: 800, step: 0.5 },
  { key: 'height', label: 'height', min: 200, max: 1200, step: 0.5 },
]
const HUMP_DIMS: Dim<CoolerDim>[] = [
  { key: 'humpHeight', label: 'hump height', min: 0, max: 400, step: 0.5 },
  { key: 'humpDepth', label: 'hump depth', min: 0, max: 400, step: 0.5 },
]
const MUG_DIMS: Dim<keyof Mug>[] = [
  { key: 'rim', label: 'rim', min: 60, max: 120, step: 0.05 },
  { key: 'base', label: 'base', min: 50, max: 120, step: 0.05 },
  { key: 'height', label: 'height', min: 80, max: 200, step: 0.05 },
  { key: 'handle', label: 'handle reach', min: 15, max: 70, step: 0.05 },
  { key: 'gap', label: 'gap between mugs', min: 5, max: 30, step: 0.05 },
]
const SOCK_DIMS: Dim<'socket'>[] = [{ key: 'socket', label: 'post socket', min: 12.5, max: 13.3, step: 0.05 }]

const KIND = {
  full: { name: 'full rack', nx: 2, mugs: 4 },
  half: { name: 'half rack', nx: 1, mugs: 2 },
} as const

const mm = (n: number) => n.toFixed(1)
const num = (n: number) => String(+n.toFixed(2))
const cm3 = (n: number) => `${Math.round(n / 1000)} cm³`

// build the rows for one group; returns a function that pushes the current values back into them
function fields<K extends string>(host: HTMLElement, group: string, dims: Dim<K>[], values: Record<K, number>): () => void {
  const rows = dims.map((d) => {
    const id = `${group}-${d.key}`
    const row = document.createElement('div')
    row.className = 'field'
    row.innerHTML =
      `<label for="${id}">${d.label}</label>` +
      `<span class="num"><input type="number" min="${d.min}" max="${d.max}" step="any" aria-label="${group} ${d.label} in mm" /> mm</span>` +
      `<input type="range" class="slider" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}" />`
    host.appendChild(row)
    const box = row.querySelector<HTMLInputElement>('input[type="number"]')!
    const slider = row.querySelector<HTMLInputElement>('input[type="range"]')!
    const show = () => {
      box.value = num(values[d.key])
      slider.value = String(values[d.key])
    }
    slider.addEventListener('input', () => {
      values[d.key] = +slider.value
      box.value = num(values[d.key])
      update()
    })
    // the box commits on enter or blur, so typing "8" on the way to "85" doesn't jump the rack around
    box.addEventListener('change', () => {
      const v = parseFloat(box.value)
      if (Number.isFinite(v)) values[d.key] = Math.min(d.max, Math.max(d.min, v))
      show()
      update()
    })
    return show
  })
  return () => rows.forEach((show) => show())
}

/* ---------- geometry: the real plates, rebuilt when the mug or the socket changes ---------- */

let geo: Geometry | null = null
let plates: { key: string; full: Part; half: Part } | null = null
let geoQueued = false

function plateKey(): string {
  return JSON.stringify([mug, fit.socket])
}

// rebuild at most once a frame, so dragging a slider doesn't queue up boolean ops
function queueGeometry(): void {
  if (!geo || geoQueued || plates?.key === plateKey()) return
  geoQueued = true
  requestAnimationFrame(() => {
    geoQueued = false
    if (!geo) return
    const r = rack(mug)
    plates = { key: plateKey(), full: geo.part(geo.plate(r, 2, 2, fit.socket)), half: geo.part(geo.plate(r, 1, 2, fit.socket)) }
    if (view) {
      view.setPlates(plates.full.mesh, plates.half.mesh)
      view.build()
    }
    printFacts(r, layout(r, cooler))
  })
}

/* ---------- the page ---------- */

let view: RackView | null = null

function update(): void {
  const r = rack(mug)
  const lay = layout(r, cooler)
  const k = KIND[kind]
  const p = plate(r, k.nx, 2)
  const towers = lay.full + (lay.half ? ` + ${lay.half} half` : '')

  $('status').textContent = (
    mode === 'cooler'
      ? [mode, `${mm(cooler.width)} × ${mm(cooler.depth)} × ${mm(cooler.height)} mm`, `${towers} tower${lay.full + lay.half === 1 ? '' : 's'}`, `${lay.tiersFlat} tiers`, `${lay.mugs} mugs`, `printing ${k.name}`]
      : [mode, k.name, `${k.nx} × 2 plate`, `${mm(2 * p.hx)} × ${mm(2 * p.hz)} mm`, `${p.posts.length} posts × ${r.postLen.toFixed(2)} mm`]
  ).join(' · ')
  if (view) {
    view.rack = r
    view.cooler = cooler
    view.layout = lay
    view.kind = kind
    view.build()
  }

  const rows: [string, string, boolean?][] = [
    ['tier pitch', `${r.tier.toFixed(2)} mm`],
    ['flat floor', `${mm(lay.flat)} mm`],
    ['tiers', lay.tiersFlat ? String(lay.tiersFlat) + (lay.placements.some((pl) => pl.y > 0) ? `, ${lay.tiersHump} on the hump` : '') : 'none', !lay.tiersFlat],
    ['room above', `${mm(lay.above)} mm`],
    ['towers', lay.full + lay.half ? towers : 'none', !(lay.full + lay.half)],
    ['mugs', String(lay.mugs), !lay.mugs],
    ['half handles', `${mm(lay.overHalf)} mm past ends`],
  ]
  $('facts').innerHTML = rows.map(([key, v, stop]) => `<dt>${key}</dt><dd class="${stop ? 'stop' : ''}">${v}</dd>`).join('')

  printFacts(r, lay)
  queueGeometry()
}

// the print section: what the two files are, how many of each this cooler needs, and the export buttons
function printFacts(r: Rack, lay: Layout): void {
  const k = KIND[kind]
  const p = plate(r, k.nx, 2)
  const w = 2 * p.hx
  const d = 2 * p.hz
  const n = p.posts.length
  const mine = lay.placements.filter((pl) => pl.half === (kind === 'half'))
  const plateCount = mine.reduce((s, pl) => s + pl.tiers, 0)
  const setCount = mine.reduce((s, pl) => s + pl.tiers - 1, 0)
  const part = plates?.key === plateKey() ? plates[kind] : null
  const plateOk = Math.max(w, d) <= BED
  const postOk = r.postLen <= BED

  $('kindNote').textContent =
    `a ${k.name} holds ${k.mugs} mugs per tier. stack plates on posts; the top plate takes no posts. ` +
    (mine.length
      ? `this cooler takes ${mine.length} ${k.name} tower${mine.length > 1 ? 's' : ''}: ${plateCount} plates and ${setCount} post sets.`
      : `no ${k.name} towers fit this cooler, but you can still print one.`)

  const facts = (el: string, title: string, rows: [string, string, boolean?][]) => {
    $(el).innerHTML =
      `<dt class="file">${title}</dt>` + rows.map(([key, v, stop]) => `<dt>${key}</dt><dd class="${stop ? 'stop' : ''}">${v}</dd>`).join('')
  }
  facts('plateFacts', `plate · ${k.nx} × 2`, [
    ['size', `${mm(w)} × ${mm(d)} × 30 mm`],
    ['print bed', plateOk ? `fits ${BED} mm` : `too big for ${BED} mm`, !plateOk],
    ['sockets', `${n} at ${num(fit.socket)} mm`],
    ['volume', part ? cm3(part.volume) : '…'],
    ['for this cooler', String(plateCount)],
  ])
  facts('postFacts', `posts · ${n} per set`, [
    ['each', `${r.postLen.toFixed(2)} × 12.7 × 12.7 mm`],
    ['print bed', postOk ? `fits ${BED} mm` : `too long for ${BED} mm`, !postOk],
    ['laid out', `${n} side by side, flat`],
    ['volume', cm3(n * 12.7 * 12.7 * r.postLen)],
    ['for this cooler', `${setCount} sets`],
  ])

  const ready = !!part
  const wait = geo ? 'building…' : 'loading geometry…'
  for (const id of ['plateBtn', 'postsBtn', 'fitLink']) $<HTMLButtonElement>(id).disabled = !ready
  $('plateBtn').textContent = ready ? `export ${k.name} plate (stl)` : wait
  $('postsBtn').textContent = ready ? `export ${n} posts (stl)` : wait
}

/* ---------- export ---------- */

function save(buf: ArrayBuffer, name: string): void {
  const url = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function exportPlate(): void {
  if (!plates) return
  const k = KIND[kind]
  const name = `mugrack-${kind}-plate-${k.nx}x2-socket${num(fit.socket)}.stl`
  save(stl(plates[kind].mesh, name), name)
}

function exportPosts(): void {
  if (!geo) return
  const r = rack(mug)
  const n = plate(r, KIND[kind].nx, 2).posts.length
  const name = `mugrack-${kind}-posts-${n}x${r.postLen.toFixed(2)}mm.stl`
  save(stl(geo.part(geo.posts(r.postLen, n)).mesh, name), name)
}

// sockets from 0.1 under the chosen size to 0.3 over, smallest at -x, and a short post to try in them
function exportFitTest(): void {
  if (!geo) return
  const s = fit.socket
  const sizes = [-0.1, 0, 0.1, 0.2, 0.3].map((d) => +(s + d).toFixed(2))
  const name = `mugrack-fit-test-${sizes[0]}-to-${sizes[4]}mm.stl`
  save(stl(geo.part(geo.fitTest(sizes)).mesh, name), name)
}

$('plateBtn').addEventListener('click', exportPlate)
$('postsBtn').addEventListener('click', exportPosts)
$('fitLink').addEventListener('click', exportFitTest)

/* ---------- controls ---------- */

const showCoolerDims = fields($('cooler'), 'cooler', COOLER_DIMS, cooler)
const showHumpDims = fields($('hump'), 'cooler', HUMP_DIMS, cooler)
const showMug = fields($('mug'), 'mug', MUG_DIMS, mug)
const showSock = fields($('sock'), 'print', SOCK_DIMS, fit)

// the hump is a toggle: off, its sliders hide but keep their values for next time
const humpBtn = $<HTMLButtonElement>('humpBtn')
function showCooler(): void {
  showCoolerDims()
  showHumpDims()
  humpBtn.classList.toggle('on', cooler.hump)
  humpBtn.setAttribute('aria-pressed', String(cooler.hump))
  $('hump').hidden = !cooler.hump
}
humpBtn.addEventListener('click', () => {
  cooler.hump = !cooler.hump
  showCooler()
  update()
})

try {
  const r = rack(mug)
  view = new RackView($('view'), r, cooler, layout(r, cooler))
} catch {
  $('view').innerHTML = '<p class="nogl">this browser couldn\'t start webgl, so there\'s no 3D view. the export still works.</p>'
}

function choose<T extends string>(selector: string, attr: string, set: (v: T) => void): void {
  const btns = Array.from(document.querySelectorAll<HTMLButtonElement>(selector))
  for (const b of btns) {
    b.addEventListener('click', () => {
      for (const o of btns) {
        o.classList.toggle('on', o === b)
        o.setAttribute('aria-pressed', String(o === b))
      }
      set(b.getAttribute(attr) as T)
    })
  }
}
choose<ViewMode>('[data-view]', 'data-view', (v) => {
  mode = v
  if (view) view.mode = mode
  update()
  view?.reset()
})
choose<Kind>('[data-kind]', 'data-kind', (v) => {
  kind = v
  update()
  if (mode !== 'cooler') view?.reset()
})

const mugsBtn = $<HTMLButtonElement>('mugsBtn')
mugsBtn.addEventListener('click', () => {
  const on = mugsBtn.getAttribute('aria-pressed') !== 'true'
  mugsBtn.setAttribute('aria-pressed', String(on))
  mugsBtn.classList.toggle('on', on)
  if (view) {
    view.mugs = on
    view.build()
  }
})
$('resetBtn').addEventListener('click', () => view?.reset())
$('defaultsBtn').addEventListener('click', () => {
  Object.assign(cooler, DEFAULT_COOLER)
  Object.assign(mug, DEFAULT_MUG)
  fit.socket = SOCK
  showCooler()
  showMug()
  showSock()
  update()
})

showCooler()
showMug()
showSock()
update()

loadGeometry()
  .then((g) => {
    geo = g
    update()
  })
  .catch(() => {
    for (const id of ['plateBtn', 'postsBtn']) $(id).textContent = "the geometry engine didn't load, so export is off"
  })
