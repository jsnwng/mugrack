import './style.css'
import { layout } from './layout'
import { BED, DEFAULT_COOLER, DEFAULT_MUG, SOCK, plate, rack, type Cooler, type Mug } from './rack'
import { RackView, type ViewMode } from './view'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const cooler: Cooler = { ...DEFAULT_COOLER }
const mug: Mug = { ...DEFAULT_MUG }
let mode: ViewMode = 'cooler'

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

const mm = (n: number) => n.toFixed(1)
const num = (n: number) => String(+n.toFixed(2))

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

let view: RackView | null = null

function update(): void {
  const r = rack(mug)
  const lay = layout(r, cooler)
  const full = plate(r, 2, 2)
  const half = plate(r, 1, 2)
  const side = 2 * full.hx
  const towers = lay.full + (lay.half ? ` + ${lay.half} half` : '')

  $('status').textContent = (
    mode === 'cooler'
      ? [mode, `${mm(cooler.width)} × ${mm(cooler.depth)} × ${mm(cooler.height)} mm`, `${towers} tower${lay.full + lay.half === 1 ? '' : 's'}`, `${lay.tiersFlat} tiers`, `${lay.mugs} mugs`]
      : [mode, '2 × 2 plate', `${mm(side)} × ${mm(side)} mm`, `tier ${r.tier.toFixed(2)} mm`, `${lay.mugs} mugs fit`]
  ).join(' · ')
  if (view) {
    view.rack = r
    view.cooler = cooler
    view.layout = lay
    view.build()
  }

  const bedOk = side <= BED
  const rows: [string, string, boolean?][] = [
    ['full plate', `${mm(side)} × ${mm(side)} mm`],
    ['half plate', `${mm(2 * half.hx)} × ${mm(2 * half.hz)} mm`],
    ['print bed', bedOk ? `fits ${BED} mm` : `too big for ${BED} mm`, !bedOk],
    ['tier pitch', `${r.tier.toFixed(2)} mm`],
    ['post length', `${r.postLen.toFixed(2)} mm`],
    ['socket', `${SOCK} mm`],
    ['flat floor', `${mm(lay.flat)} mm`],
    ['tiers', lay.tiersFlat ? String(lay.tiersFlat) + (lay.placements.some((p) => p.y > 0) ? `, ${lay.tiersHump} on the hump` : '') : 'none', !lay.tiersFlat],
    ['room above', `${mm(lay.above)} mm`],
    ['towers', lay.full + lay.half ? towers : 'none', !(lay.full + lay.half)],
    ['mugs', String(lay.mugs), !lay.mugs],
  ]
  rows.push(['half handles', `${mm(lay.overHalf)} mm past ends`])
  $('facts').innerHTML = rows.map(([k, v, stop]) => `<dt>${k}</dt><dd class="${stop ? 'stop' : ''}">${v}</dd>`).join('')
}

const showCoolerDims = fields($('cooler'), 'cooler', COOLER_DIMS, cooler)
const showHumpDims = fields($('hump'), 'cooler', HUMP_DIMS, cooler)
const showMug = fields($('mug'), 'mug', MUG_DIMS, mug)

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
  $('view').innerHTML = '<p class="nogl">this browser couldn\'t start webgl, so there\'s no 3D view.</p>'
}

const viewBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'))
for (const b of viewBtns) {
  b.addEventListener('click', () => {
    mode = b.dataset.view as ViewMode
    for (const o of viewBtns) {
      o.classList.toggle('on', o === b)
      o.setAttribute('aria-pressed', String(o === b))
    }
    if (view) view.mode = mode
    update()
    view?.reset()
  })
}

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
  showCooler()
  showMug()
  update()
})

showCooler()
showMug()
update()
