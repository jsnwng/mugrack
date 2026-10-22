"""Halmaek mug rack: printable STL generator (all dimensions in mm, Z up, print orientation)."""
import sys, numpy as np, trimesh
from manifold3d import Manifold

IN = 25.4
SEG = 96
# ---- mug (measured) ----
RIM, BASE, HGT = 3.25 * IN, 3.25 * IN, 5.5 * IN
GAP = 0.5 * IN
PITCH = RIM + GAP                      # 95.25
# ---- rack design ----
T = 0.25 * IN                           # plate thickness 6.35
BAR_FRAME, BAR_LAT = 0.5 * IN, 0.4 * IN
COLLAR_H = 0.45 * IN                    # 11.43 above plate top
COLLAR_IN_R = BASE / 2 + 0.1 * IN       # mug seat radius
COLLAR_OUT_R = COLLAR_IN_R + 0.25 * IN
RING_H = T + COLLAR_H                   # ring rises from z=0
POST = 0.5 * IN                         # post square 12.7
BOSS = 17.0                             # boss square
BOSS_H = 30.0
SOCK_DEPTH = 20.0                       # socket from boss top down (z=10..30)
RECESS = 13.4                           # underside recess square
RECESS_D = 3.0
VENT_R = 1.25                           # 2.5 mm vent hole
SOCK = float(sys.argv[1]) if len(sys.argv) > 1 else 12.8
TIER = T + (HGT / IN + 0.5) * IN        # 158.75 plate underside to plate underside
POST_LEN = TIER + RECESS_D - (BOSS_H - SOCK_DEPTH)   # 151.75

def cube(sx, sy, sz, cx, cy, z0):
    return Manifold.cube([sx, sy, sz], center=True).translate([cx, cy, z0 + sz / 2])

def cyl(r, h, cx, cy, z0):
    return Manifold.cylinder(h, r, r, SEG).translate([cx, cy, z0])

def union(parts):
    out = parts[0]
    for p in parts[1:]:
        out = out + p
    return out

def plate(nx, nz):
    xs = [(i - (nx - 1) / 2) * PITCH for i in range(nx)]
    zs = [(i - (nz - 1) / 2) * PITCH for i in range(nz)]
    Fx = (nx - 1) * PITCH / 2 + RIM / 2 + 0.45 * IN
    Fz = (nz - 1) * PITCH / 2 + RIM / 2 + 0.45 * IN
    hx, hz = Fx + BAR_FRAME / 2, Fz + BAR_FRAME / 2       # plate half sizes
    outer = cube(2 * hx, 2 * hz, T, 0, 0, 0)
    inner = cube(2 * (hx - BAR_FRAME), 2 * (hz - BAR_FRAME), T + 2, 0, 0, -1)
    parts = [outer - inner]
    bxs = xs + ([0.0] if nx % 2 == 0 else [])
    bzs = zs + ([0.0] if nz % 2 == 0 else [])
    for x in bxs: parts.append(cube(BAR_LAT, 2 * hz - 0.02, T, x, 0, 0))
    for z in bzs: parts.append(cube(2 * hx - 0.02, BAR_LAT, T, 0, z, 0))
    for x in xs:
        for z in zs:
            ring = cyl(COLLAR_OUT_R, RING_H, x, z, 0) - cyl(COLLAR_IN_R, RING_H + 2, x, z, -1)
            parts.append(ring)
    # post positions (boss flush with the outer edge, extending inward)
    o = BOSS / 2
    if nx == 2:
        posts = [(hx - o, 0), (-(hx - o), 0), (0, hz - o), (0, -(hz - o))]
    else:
        # half module v3: posts in all four corners plus the two x-edge midpoints (6 total).
        # Handles must not point at a corner: point mug A toward +z and mug B toward -z
        # (along the plate's long axis, away from each other) so the plate width stays 118 mm.
        posts = [(hx - o, 0), (-(hx - o), 0),
                 (hx - o, hz - o), (-(hx - o), hz - o),
                 (hx - o, -(hz - o)), (-(hx - o), -(hz - o))]
    for (px, pz) in posts:
        parts.append(cube(BOSS, BOSS, BOSS_H, px, pz, 0))
    body = union(parts)
    for (px, pz) in posts:
        body = body - cube(SOCK, SOCK, SOCK_DEPTH + 2, px, pz, BOSS_H - SOCK_DEPTH)
        body = body - cube(RECESS, RECESS, RECESS_D + 1, px, pz, -1)
        body = body - cyl(VENT_R, (BOSS_H - SOCK_DEPTH) + 1.0 - RECESS_D + 1.0, px, pz, RECESS_D - 0.5)  # air vent: socket floor to underside recess
    return body, posts, (2 * hx, 2 * hz)

def post(length=POST_LEN):
    m = cube(POST, POST, length, 0, 0, 0)
    # print flat: lie the long axis along X on the bed
    return m.rotate([0, 90, 0]).translate([length / 2, 0, POST / 2])

def coupon(sizes=(12.7, 12.8, 12.9, 13.0, 13.1)):
    pitch = BOSS + 4
    w = len(sizes) * pitch
    parts = [cube(w, BOSS + 6, T, 0, 0, 0)]
    for i, s in enumerate(sizes):
        parts.append(cube(BOSS, BOSS, BOSS_H, (i - (len(sizes) - 1) / 2) * pitch, 0, 0))
    m = union(parts)
    for i, s in enumerate(sizes):
        m = m - cube(s, s, SOCK_DEPTH + 2, (i - (len(sizes) - 1) / 2) * pitch, 0, BOSS_H - SOCK_DEPTH)
    return m

def save(m, name):
    mesh = m.to_mesh()
    tm = trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts))
    # centre on XY, sit on z=0
    b = tm.bounds
    tm.apply_translation([-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2, -b[0][2]])
    tm.export(f'/home/claude/rack_stl/out/{name}.stl')
    e = tm.extents
    print(f'{name}: watertight={tm.is_watertight} volume={tm.volume/1000:.1f} cm3 extents={e[0]:.1f} x {e[1]:.1f} x {e[2]:.1f} mm  tris={len(tm.faces)}')
    return tm

if __name__ == '__main__':
    print('post length', round(POST_LEN, 2), 'tier', round(TIER, 2), 'socket', SOCK)
    pf, _, ef = plate(2, 2); save(pf, 'rack_plate_full_2x2')
    ph, _, eh = plate(1, 2); save(ph, 'rack_plate_half_1x2')
    save(post(), 'rack_post')
    save(post(60), 'fit_test_post_stub')
    save(coupon(), 'fit_test_sockets')
