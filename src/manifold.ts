// Loads manifold-3d's WASM through Vite, so the build ships the .wasm as an asset.
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { geometry } from './geometry'

export type Geometry = ReturnType<typeof geometry>

export async function loadGeometry(): Promise<Geometry> {
  const wasm = await Module({ locateFile: () => wasmUrl })
  wasm.setup()
  return geometry(wasm)
}
