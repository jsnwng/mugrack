# Mug Rack Modeler: handoff for Claude Code

## Goal
Turn the Halmaek mug rack modeler into a generic, public portfolio tool. A visitor enters their cooler or freezer interior size, sets mug dimensions and uses a mug slider, sees a live 3D preview, and exports STL files (plates, posts, fit-test coupons) to print their own rack. STL generation must run in the browser, with no server.

## Files in this folder
- `make_stl.py`: current Python generator (manifold3d + trimesh). Source of truth for geometry. All dimensions in mm, Z up, print orientation. It writes to a hardcoded path (`/home/claude/rack_stl/out/`); change that when running locally. Optional argv[1] sets the socket size (default 12.8).
- `halmaek-mug-rack.html`: the current published 3D preview ("Halmaek Mug Rack", Version 7, https://claude.ai/artifact/42fi4HC4TDAhCiAbohJMB3). It is tied to the author's Midea freezer and still shows the old 4-post half rack. It is a preview only and does not export STLs.

## Plan
1. Port the geometry (plates, bars, collars, bosses, sockets, vents, posts, coupon) to client-side JS/WASM. The manifold-3d JS/WASM build is one option. Output must match the Python STLs (compare volume and extents; below).
2. Parametrize on cooler interior (width, depth, height, optional obstruction such as a compressor hump), mug rim/base diameter, height and handle reach, the mug slider (count), and the post-socket tolerance.
3. Add fit checks and warnings: tower height vs. cooler height, plate footprint vs. floor, handle overhang at plate ends.
4. STL export for full plates, half plates, posts and a socket-fit coupon (sizes around the chosen tolerance).
5. Polish and host on the author's portfolio.

## Current geometry (author's build, mm)
Mug (CREATIVELAND 16 oz glass, handled): rim = base = 82.55, height 139.7, handle reach 44.45. Gap between mugs 12.7, so pitch = 95.25.

Rack: plate thickness 6.35; frame bar 12.7; lateral bar 10.16; collar rises 11.43 above plate top; mug seat radius = base/2 + 2.54; collar outer = seat + 6.35; post square 12.7; boss square 17.0, boss height 30; socket 12.8 square, 20 deep from boss top; underside recess 13.4 square, 3.0 deep; vent hole 2.5 mm diameter from socket floor to recess; tier pitch 158.75 (plate underside to plate underside); post length 151.75.

Sizes: full plate (2x2) 213.36 square; half plate (1x2) 118.11 x 213.36. A tower of 4 plates is 25.2 in tall. Full tower holds 16 mugs. The top plate has no posts.

Posts: full plate has 4 posts at edge midpoints. Half plate v3 has 6 posts (4 corners + 2 x-edge midpoints) because 4-post plates wobble noticeably. On the half plate, handles must point along the long axis (mug A toward +z, mug B toward -z), away from each other, to keep the 118 mm width. Handles overhang about 1 in at plate ends.

Fit finding: sockets at 12.7 and 12.8 mm are tight, 12.9 and up are loose (printed PETG on a Bambu P2S). Default is 12.8.

Reference freezer (Midea 3.5 cu ft chest): interior 17.7 x 13.4 x 27.9 in; compressor hump 8 in high, 7.25 in deep, full width.

Expected outputs from `make_stl.py` for regression checks: post length 151.75 mm; full plate extents 213.4 x 213.4; half plate (v3) 118.1 x 213.4; all meshes watertight.

## Design notes
- Validate first-class: tower fits the entered cooler height; warn with a margin, since frost on the walls and the lid also take room.
- Keep the 6-post half plate as the stable default.
- Handle direction matters for footprint; expose it as a setting or a warning.
- The mug slider changes counts and plate layout, not just a visual.
