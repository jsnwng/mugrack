// Placeholder 3D view: the rack drawn from three.js primitives, sized from rack.ts. The real meshes come
// from the manifold port; this only has to look like the rack and orbit nicely.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Layout, Placement } from './layout'
import { BAR_FRAME, BAR_LAT, BOSS, BOSS_H, IN, POST, POST_Z0, RING_H, T, plate, type Cooler, type Plate, type Rack } from './rack'

export type ViewMode = 'cooler' | 'module' | 'stack' | 'exploded'

const EXPLODE = 80 // how far the exploded view lifts the upper plate
const GLASS_WALL = 2.5 // mm, the mug's wall
const GLASS_FLOOR = 9 // mm, its heavy base

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export class RackView {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 20000)
  private controls: OrbitControls
  private root = new THREE.Group()
  private matRack: THREE.MeshLambertMaterial
  private matGlass: THREE.MeshPhongMaterial
  private matHandle: THREE.MeshPhongMaterial
  private matShell: THREE.MeshBasicMaterial
  private matHump: THREE.MeshLambertMaterial
  private lineGlass: THREE.LineBasicMaterial
  private lineShell: THREE.LineBasicMaterial
  private queued = false

  mode: ViewMode = 'cooler'
  mugs = true

  constructor(private host: HTMLElement, public rack: Rack, public cooler: Cooler, public layout: Layout) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(this.renderer.domElement)

    // the rack is solid filament, shaded by the lights rather than outlined
    this.matRack = new THREE.MeshLambertMaterial({ color: token('--rack') })
    const glass = { color: token('--glass'), specular: 0xffffff, shininess: 90, transparent: true, depthWrite: false, side: THREE.DoubleSide }
    this.matGlass = new THREE.MeshPhongMaterial({ ...glass, opacity: 0.16 })
    this.matHandle = new THREE.MeshPhongMaterial({ ...glass, opacity: 0.4 })
    // the cooler is drawn from the inside only: the walls facing the camera drop away as you orbit
    this.matShell = new THREE.MeshBasicMaterial({ color: token('--shell'), transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false })
    this.matHump = new THREE.MeshLambertMaterial({ color: token('--hump') })
    this.lineGlass = new THREE.LineBasicMaterial({ color: token('--glass-edge'), transparent: true, opacity: 0.45 })
    this.lineShell = new THREE.LineBasicMaterial({ color: token('--shell'), transparent: true, opacity: 0.7 })

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445055, 1.3))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(300, 800, 500)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-500, 300, -400)
    this.scene.add(fill)
    this.scene.add(this.root)

    // a 1 in grid on the floor of the stage
    const grid = new THREE.GridHelper(48 * IN, 48, token('--stage-grid'), token('--stage-grid'))
    this.scene.add(grid)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.minDistance = 150
    this.controls.maxDistance = 6000
    this.controls.maxPolarAngle = Math.PI * 0.55
    this.controls.addEventListener('change', () => this.render())

    new ResizeObserver(() => this.resize()).observe(host)
    this.build()
    this.reset()
  }

  build(): void {
    for (const child of this.root.children.splice(0)) {
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose()
      })
    }
    if (this.mode === 'cooler') {
      this.root.add(this.shell())
      for (const pl of this.layout.placements) this.root.add(this.tower(pl))
    } else {
      const p = plate(this.rack, 2, 2)
      const tiers = this.mode === 'module' ? 1 : 2
      for (let k = 0; k < tiers; k++) {
        const lift = this.mode === 'exploded' && k > 0 ? EXPLODE : 0
        this.root.add(this.module(p, k * this.rack.tier + lift, k < tiers - 1))
      }
    }
    this.render()
  }

  reset(): void {
    let top: number
    let r: number
    if (this.mode === 'cooler') {
      const { width, depth, height } = this.cooler
      top = height
      r = Math.max(width, depth, height) * 2.5
    } else {
      top = this.mode === 'module' ? this.rack.tier : 2 * this.rack.tier + (this.mode === 'exploded' ? EXPLODE : 0)
      r = Math.max(700, top * 2.6)
    }
    this.controls.target.set(0, top / 2, 0)
    this.camera.position.set(r * 0.62, top / 2 + r * 0.5, r * 0.62)
    this.controls.update()
    this.render()
  }

  // the cooler's inside as an open box, and the hump at the +x end
  private shell(): THREE.Group {
    const { width, depth, height, hump, humpHeight, humpDepth } = this.cooler
    const g = new THREE.Group()
    const box = new THREE.BoxGeometry(width, height, depth)
    const walls = new THREE.Mesh(box, this.matShell)
    walls.position.y = height / 2
    walls.renderOrder = -1
    walls.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), this.lineShell))
    g.add(walls)
    if (hump && humpHeight > 0 && humpDepth > 0) {
      const d = Math.min(humpDepth, width)
      const hump = new THREE.BoxGeometry(d, humpHeight, depth)
      const m = new THREE.Mesh(hump, this.matHump)
      m.position.set(width / 2 - d / 2, humpHeight / 2, 0)
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(hump), this.lineShell))
      g.add(m)
    }
    return g
  }

  private tower(pl: Placement): THREE.Group {
    const g = new THREE.Group()
    g.position.set(pl.x, pl.y, pl.z)
    if (pl.half) g.rotation.y = Math.PI / 2 // long side along x
    const p = plate(this.rack, pl.half ? 1 : 2, 2)
    for (let k = 0; k < pl.tiers; k++) g.add(this.module(p, k * this.rack.tier, k < pl.tiers - 1))
    return g
  }

  // one plate with its collars and bosses, its mugs, and the posts up to the next plate
  private module(p: Plate, y: number, withPosts: boolean): THREE.Group {
    const g = new THREE.Group()
    g.position.y = y
    const add = (geo: THREE.BufferGeometry, x: number, yy: number, z: number) => {
      const m = new THREE.Mesh(geo, this.matRack)
      m.position.set(x, yy, z)
      g.add(m)
    }
    const box = (sx: number, sy: number, sz: number, x: number, z: number, y0 = 0) =>
      add(new THREE.BoxGeometry(sx, sy, sz), x, y0 + sy / 2, z)

    // frame, then the lateral bars through each mug row and the middle
    const { hx, hz } = p
    box(2 * hx, T, BAR_FRAME, 0, hz - BAR_FRAME / 2)
    box(2 * hx, T, BAR_FRAME, 0, -(hz - BAR_FRAME / 2))
    box(BAR_FRAME, T, 2 * hz - 2 * BAR_FRAME, hx - BAR_FRAME / 2, 0)
    box(BAR_FRAME, T, 2 * hz - 2 * BAR_FRAME, -(hx - BAR_FRAME / 2), 0)
    const bxs = p.nx % 2 === 0 ? [...p.xs, 0] : p.xs
    const bzs = p.nz % 2 === 0 ? [...p.zs, 0] : p.zs
    for (const x of bxs) box(BAR_LAT, T, 2 * hz - 2 * BAR_FRAME, x, 0)
    for (const z of bzs) box(2 * hx - 2 * BAR_FRAME, T, BAR_LAT, 0, z)

    // collars
    const ring = new THREE.Shape()
    ring.absarc(0, 0, this.rack.collarOut, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, this.rack.collarIn, 0, Math.PI * 2, true)
    ring.holes.push(hole)
    const collar = new THREE.ExtrudeGeometry(ring, { depth: RING_H, bevelEnabled: false, curveSegments: 48 })
    collar.rotateX(-Math.PI / 2)
    for (const x of p.xs) for (const z of p.zs) add(collar.clone(), x, 0, z)
    collar.dispose()

    // bosses, and the posts standing in their sockets
    for (const [x, z] of p.posts) {
      box(BOSS, BOSS_H, BOSS, x, z)
      if (withPosts) box(POST, this.rack.postLen, POST, x, z, POST_Z0)
    }

    if (this.mugs) {
      for (const x of p.xs) {
        for (const z of p.zs) {
          // full plate: handles point diagonally into the empty corners. half plate: along its long side, apart.
          const dir: [number, number] = p.nx === 2 ? [Math.sign(x) || 1, Math.sign(z) || 1] : [0, Math.sign(z) || 1]
          g.add(this.mug(x, z, dir))
        }
      }
    }
    return g
  }

  // a glass mug: a turned body with real wall and base thickness, a tube handle, and its rim and base edges
  private mug(x: number, z: number, dir: [number, number]): THREE.Group {
    const { rim, base, height, handle } = this.rack.mug
    const g = new THREE.Group()
    g.position.set(x, T, z)
    const wallAt = (y: number) => base / 2 + ((rim - base) / 2) * (y / height)
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(base / 2, 0),
      new THREE.Vector2(rim / 2, height),
      new THREE.Vector2(rim / 2 - GLASS_WALL, height),
      new THREE.Vector2(wallAt(GLASS_FLOOR) - GLASS_WALL, GLASS_FLOOR),
      new THREE.Vector2(0, GLASS_FLOOR),
    ]
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), this.matGlass)
    g.add(body)
    g.add(this.circle(base / 2, 0))
    g.add(this.circle(rim / 2, height))

    // the handle: a cubic from near the rim out to its reach and back to the wall lower down
    const yTop = height * 0.82
    const yBot = height * 0.25
    const out = handle / 0.75 // a cubic with both controls at the same x peaks 3/4 of the way to them
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(wallAt(yTop) - 1, yTop, 0),
      new THREE.Vector3(wallAt(yTop) + out, yTop, 0),
      new THREE.Vector3(wallAt(yBot) + out, yBot, 0),
      new THREE.Vector3(wallAt(yBot) - 1, yBot, 0),
    )
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 5, 8, false), this.matHandle)
    tube.rotation.y = Math.atan2(-dir[1], dir[0])
    g.add(tube)
    return g
  }

  private circle(r: number, y: number): THREE.LineLoop {
    const pts = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(48).map((p) => new THREE.Vector3(p.x, y, p.y))
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.lineGlass)
  }

  private resize(): void {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.render()
  }

  // render on demand, at most once a frame
  private render(): void {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => {
      this.queued = false
      this.renderer.render(this.scene, this.camera)
    })
  }
}
