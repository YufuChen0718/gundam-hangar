"""Reproducible full-body asset preparation supporting Rigid Armor (natural concave cuts,
capped boundaries, inner-frame joint fillers, secondary skirt bones) and Smooth LBS comparison.

Usage:
  Blender -b assets-src/gundam-sentinel-source.blend --disable-autoexec --python scripts/prepare_mecha.py -- --output "$PWD" --asset sentinel
  Blender -b assets-src/mecha-original.blend --disable-autoexec --python scripts/prepare_mecha.py -- --output "$PWD" --asset legacy
"""
import bpy, bmesh, json, math, sys, argparse, collections
from pathlib import Path
from mathutils import Vector, Matrix

p = argparse.ArgumentParser()
p.add_argument('--output', required=True)
p.add_argument('--asset', choices=['auto', 'sentinel', 'legacy'], default='auto')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(a.output)
for folder in ['assets-src', 'public/assets/models', 'docs/results']:
    (out / folder).mkdir(parents=True, exist_ok=True)

source = bpy.data.objects['Mesh_0']
mesh = source.data
material = mesh.materials[0]

asset_key = a.asset
if asset_key == 'auto':
    blend_name = Path(bpy.data.filepath).name.lower() if bpy.data.filepath else ''
    asset_key = 'sentinel' if ('sentinel' in blend_name or len(mesh.vertices) > 8000) else 'legacy'

# For Sentinel, bisect the right and left knees with a single clean slanted plane along the
# natural diagonal kneecap-to-thigh seam so the cut rim is razor-straight (zero sawtooth)
# while preserving the entire kneecap plate + circular hinge disc on the shin.
KNEE_PLANE_Z0 = -0.158
KNEE_PLANE_SLOPE_Y = 0.52
KNEE_PLANE_NO = Vector((0.0, KNEE_PLANE_SLOPE_Y, 1.0)).normalized()
knee_bisect_stats = None
if asset_key == 'sentinel':
    bm_bi = bmesh.new()
    bm_bi.from_mesh(mesh)
    bm_bi.faces.ensure_lookup_table()
    bm_bi.edges.ensure_lookup_table()
    bm_bi.verts.ensure_lookup_table()
    orig_tri_count = len(bm_bi.faces)
    for side_sign in (-1.0, 1.0):
        # Collect faces/edges/verts inside the leg band around the knee plane
        side_faces = []
        for f in bm_bi.faces:
            c = f.calc_center_median()
            if (c.x < -0.04 if side_sign < 0 else c.x > 0.04) and -0.32 < c.z < -0.05:
                side_faces.append(f)
        side_edges = list({e for f in side_faces for e in f.edges})
        side_verts = list({v for f in side_faces for v in f.verts})
        bmesh.ops.bisect_plane(
            bm_bi,
            geom=side_faces + side_edges + side_verts,
            dist=1e-5,
            plane_co=Vector((side_sign * 0.205, 0.0, KNEE_PLANE_Z0)),
            plane_no=KNEE_PLANE_NO,
            use_snap_center=False,
            clear_inner=False,
            clear_outer=False,
        )
    ngons = [f for f in bm_bi.faces if len(f.verts) > 3]
    if ngons:
        bmesh.ops.triangulate(bm_bi, faces=ngons)
    # Collapse any degenerate sub-0.2mm micro-slivers where the bisect plane grazed an existing vertex
    bmesh.ops.remove_doubles(bm_bi, verts=bm_bi.verts, dist=2e-4)
    bm_bi.to_mesh(mesh)
    bm_bi.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.update()
    knee_bisect_stats = {
        'plane_equation': f'z = {KNEE_PLANE_Z0:.3f} - {KNEE_PLANE_SLOPE_Y:.2f} * y',
        'plane_normal': [round(KNEE_PLANE_NO.x, 4), round(KNEE_PLANE_NO.y, 4), round(KNEE_PLANE_NO.z, 4)],
        'triangles_before': orig_tri_count,
        'triangles_after': len(mesh.polygons),
        'added_triangles': len(mesh.polygons) - orig_tri_count,
    }

verts = [v.co.copy() for v in mesh.vertices]
faces = [list(f.vertices) for f in mesh.polygons]
uvs = [[tuple(mesh.uv_layers.active.data[i].uv) for i in f.loop_indices] for f in mesh.polygons]
normals = [[tuple(mesh.corner_normals[i].vector) for i in f.loop_indices] for f in mesh.polygons]

# Per-asset configuration (joint pivot positions, sockets, part boundaries, fillers, and skirts)
ASSET_CONFIGS = {
    'legacy': {
        'has_embedded_equipment': True,
        'rigid_armor_features': False,
        'blend_out': 'assets-src/gundam-rigged.blend',
        'glb_out': 'public/assets/models/gundam-rigged.glb',
        'report_out': 'docs/results/preparation-report.json',
        'grip': Vector((-.435, .110, -.015)),
        'left_grip': Vector((.385, -.165, .015)),
        'left_forearm_socket': Vector((.415, -.040, .250)),
        'back_socket': Vector((0.0, .25, .45)),
        'barrel_dir': Vector((-.29, -.46, -.81)),
        'right_outline': [
            (-.49, .75), (-.205, .75), (-.225, .54), (-.238, .43), (-.26, .30),
            (-.295, .16), (-.335, .075), (-.335, -.11), (-.53, -.11), (-.53, .2), (-.45, .43),
        ],
        'left_outline': [
            (.49, .73), (.205, .73), (.215, .54), (.235, .43), (.255, .30),
            (.265, .16), (.255, .075), (.255, -.06), (.48, -.06), (.48, .2), (.45, .43),
        ],
        'positions': {
            'pelvis': Vector((0.0, 0.055, 0.080)),
            'torso': Vector((0.048, 0.055, 0.272)),
            'head': Vector((0.012, 0.073, 0.665)),
            'rightShoulder': Vector((-0.285, 0.235, 0.535)),
            'rightElbow': Vector((-0.325, 0.285, 0.390)),
            'rightWrist': Vector((-0.415, 0.180, 0.085)),
            'leftShoulder': Vector((0.230, 0.184, 0.576)),
            'leftElbow': Vector((0.366, -0.040, 0.406)),
            'leftWrist': Vector((0.394, -0.149, 0.088)),
            'rightHip': Vector((-0.161, 0.220, -0.036)),
            'rightKnee': Vector((-0.237, 0.220, -0.378)),
            'rightAnkle': Vector((-0.308, 0.220, -0.721)),
            'leftHip': Vector((0.162, -0.050, -0.036)),
            'leftKnee': Vector((0.248, -0.050, -0.378)),
            'leftAnkle': Vector((0.364, -0.050, -0.721)),
        },
        'right_arm_z_splits': (0.405, 0.085),
        'left_arm_z_splits': (0.405, 0.085),
        'leg_z_splits': (-0.035, -0.38, -0.72),
        'torso_z_split': 0.275,
    },
    'sentinel': {
        'has_embedded_equipment': False,
        'rigid_armor_features': True,
        'blend_out': 'assets-src/gundam-sentinel-rigged.blend',
        'glb_out': 'public/assets/models/gundam-sentinel.glb',
        'report_out': 'docs/results/sentinel-preparation-report.json',
        'grip': Vector((-.372, -.055, .058)),
        'left_grip': Vector((.372, -.055, .058)),
        'left_forearm_socket': Vector((.415, .012, .265)),
        'back_socket': Vector((0.0, .220, .520)),
        'barrel_dir': Vector((0.0, -1.0, 0.0)),
        'right_outline': [
            (-0.52, 0.78), (-0.196, 0.78), (-0.200, 0.50), (-0.235, 0.45),
            (-0.275, 0.33), (-0.275, 0.14), (-0.275, -0.02), (-0.52, -0.02),
        ],
        'left_outline': [
            (0.52, 0.78), (0.196, 0.78), (0.200, 0.50), (0.235, 0.45),
            (0.275, 0.33), (0.275, 0.14), (0.275, -0.02), (0.52, -0.02),
        ],
        # Refined mechanical hinge/ball pivots measured from orthographic Sentinel geometry
        'positions': {
            'pelvis': Vector((0.0, 0.010, 0.180)),
            'torso': Vector((0.0, 0.010, 0.345)),
            'head': Vector((0.0, 0.025, 0.735)),
            'rightShoulder': Vector((-0.255, 0.045, 0.655)),
            'rightElbow': Vector((-0.355, 0.055, 0.415)),
            'rightWrist': Vector((-0.375, -0.038, 0.135)),
            'leftShoulder': Vector((0.255, 0.045, 0.655)),
            'leftElbow': Vector((0.355, 0.055, 0.415)),
            'leftWrist': Vector((0.375, -0.038, 0.135)),
            'rightHip': Vector((-0.145, 0.015, 0.135)),
            'rightKnee': Vector((-0.205, 0.014, -0.212)),
            'rightAnkle': Vector((-0.320, 0.015, -0.760)),
            'leftHip': Vector((0.145, 0.015, 0.135)),
            'leftKnee': Vector((0.205, 0.014, -0.212)),
            'leftAnkle': Vector((0.320, 0.015, -0.760)),
            # Secondary skirt armor pivots on each plate's top hinge edge (parent: pelvis)
            'frontRightSkirt': Vector((-0.120, -0.140, 0.312)),
            'frontLeftSkirt': Vector((0.120, -0.140, 0.312)),
            'sideRightSkirt': Vector((-0.195, 0.005, 0.310)),
            'sideLeftSkirt': Vector((0.195, 0.005, 0.310)),
        },
        'right_arm_z_splits': (0.452, 0.134),
        'left_arm_z_splits': (0.452, 0.134),
        'leg_z_splits': (0.118, -0.175, -0.742),
        'torso_z_split': 0.332,
        # Dark-gray inner-frame joint fillers (parent_bone, shape, center, radius, depth, axis)
        'joint_fillers': [
            {'name': 'filler_torso', 'parent': 'pelvis', 'shape': 'cylinder', 'center': (0.0, -0.005, 0.332), 'radius': 0.078, 'depth': 0.092, 'axis': 'Z'},
            {'name': 'filler_head', 'parent': 'torso', 'shape': 'cylinder', 'center': (0.0, 0.025, 0.728), 'radius': 0.046, 'depth': 0.068, 'axis': 'Z'},
            {'name': 'filler_rightShoulder', 'parent': 'torso', 'shape': 'sphere', 'center': (-0.228, 0.045, 0.642), 'radius': 0.072},
            {'name': 'filler_leftShoulder', 'parent': 'torso', 'shape': 'sphere', 'center': (0.228, 0.045, 0.642), 'radius': 0.072},
            {'name': 'filler_rightElbow', 'parent': 'rightShoulder', 'shape': 'cylinder', 'center': (-0.348, 0.055, 0.428), 'radius': 0.046, 'depth': 0.088, 'axis': 'X'},
            {'name': 'filler_leftElbow', 'parent': 'leftShoulder', 'shape': 'cylinder', 'center': (0.348, 0.055, 0.428), 'radius': 0.046, 'depth': 0.088, 'axis': 'X'},
            {'name': 'filler_rightWrist', 'parent': 'rightElbow', 'shape': 'sphere', 'center': (-0.375, -0.038, 0.134), 'radius': 0.036},
            {'name': 'filler_leftWrist', 'parent': 'leftElbow', 'shape': 'sphere', 'center': (0.375, -0.038, 0.134), 'radius': 0.036},
            {'name': 'filler_rightHip', 'parent': 'pelvis', 'shape': 'sphere', 'center': (-0.145, 0.010, 0.135), 'radius': 0.076},
            {'name': 'filler_leftHip', 'parent': 'pelvis', 'shape': 'sphere', 'center': (0.145, 0.010, 0.135), 'radius': 0.076},
            {'name': 'filler_pelvisCore', 'parent': 'pelvis', 'shape': 'cylinder', 'center': (0.0, 0.005, 0.215), 'radius': 0.122, 'depth': 0.185, 'axis': 'Z'},
            {'name': 'filler_rightKnee', 'parent': 'rightHip', 'shape': 'cylinder', 'center': (-0.200, 0.012, -0.194), 'radius': 0.062, 'depth': 0.118, 'axis': 'X', 'material': 'knee_frame'},
            {'name': 'filler_leftKnee', 'parent': 'leftHip', 'shape': 'cylinder', 'center': (0.200, 0.012, -0.194), 'radius': 0.062, 'depth': 0.118, 'axis': 'X', 'material': 'knee_frame'},
            {'name': 'filler_rightAnkle', 'parent': 'rightKnee', 'shape': 'cylinder', 'center': (-0.320, 0.010, -0.752), 'radius': 0.058, 'depth': 0.118, 'axis': 'X'},
            {'name': 'filler_leftAnkle', 'parent': 'leftKnee', 'shape': 'cylinder', 'center': (0.320, 0.010, -0.752), 'radius': 0.058, 'depth': 0.118, 'axis': 'X'},
        ],
    },
}

cfg = ASSET_CONFIGS[asset_key]
has_embedded_equip = cfg['has_embedded_equipment']
rigid_features = cfg['rigid_armor_features']
grip = cfg['grip']
left_grip = cfg['left_grip']
right_outline = cfg['right_outline']
left_outline = cfg['left_outline']
positions = cfg['positions']
r_z_upper, r_z_fore = cfg['right_arm_z_splits']
l_z_upper, l_z_fore = cfg['left_arm_z_splits']
z_hip_split, z_knee_split, z_ankle_split = cfg['leg_z_splits']
z_torso_split = cfg['torso_z_split']

def poly_inside(x, z, poly):
    hit = False
    for i, (xa, za) in enumerate(poly):
        xb, zb = poly[i - 1]
        if (za > z) != (zb > z) and x < (xb - xa) * (z - za) / (zb - za) + xa:
            hit = not hit
    return hit

# Connected components of raw vertices (for legacy embedded shield)
parents = list(range(len(verts)))
def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i

for e in mesh.edges:
    ra, rb = find(e.vertices[0]), find(e.vertices[1])
    if ra != rb:
        parents[rb] = ra

components = collections.defaultdict(list)
for i in range(len(verts)):
    components[find(i)].append(i)

shield_ids = set()
if has_embedded_equip:
    shield_ids = set(next(ids for ids in components.values() if len(ids) < 1000))

part_names = [
    'waistPart', 'chestPart', 'headPart',
    'rightUpperArm', 'rightForearm', 'rightPalm',
    'leftUpperArm', 'leftForearm', 'leftPalm',
    'rightThigh', 'rightShin', 'rightFoot',
    'leftThigh', 'leftShin', 'leftFoot',
]
if rigid_features:
    part_names.extend(['frontRightSkirtPart', 'frontLeftSkirtPart', 'sideRightSkirtPart', 'sideLeftSkirtPart'])
if has_embedded_equip:
    part_names.extend(['rifle', 'shield'])

# Precompute face centroids and bmesh edge dihedral angles for concavity-guided cut refinement
face_centroids = [sum((verts[j] for j in f), Vector()) / len(f) for f in faces]

bm_src = bmesh.new()
bm_src.from_mesh(mesh)
bm_src.faces.ensure_lookup_table()
bm_src.edges.ensure_lookup_table()

# Build dual graph: edge_dual[(fa, fb)] = (length, signed_dihedral_rad, edge_cost)
face_adj = collections.defaultdict(list)
edge_dihedral = {}
for e in bm_src.edges:
    if len(e.link_faces) == 2:
        fa = e.link_faces[0].index
        fb = e.link_faces[1].index
        elen = max(e.calc_length(), 1e-6)
        ang = e.calc_face_angle_signed(0.0)
        # Concave grooves (negative dihedral angle) get 12x lower cut cost so min-cut snaps into panel gaps
        if ang < -0.35:
            mult = 0.08
        elif ang < -0.12:
            mult = 0.25
        else:
            mult = 1.0 + 3.0 * max(0.0, ang)
        cost = elen * mult
        face_adj[fa].append((fb, cost, elen, ang))
        face_adj[fb].append((fa, cost, elen, ang))
        key = (min(fa, fb), max(fa, fb))
        edge_dihedral[key] = (elen, ang)
bm_src.free()

# Dinic max-flow / min-cut for snapping each joint cut into existing concave panel seams
def dinic_min_cut(nodes, edges_cap, source_caps, sink_caps):
    """Returns set of nodes assigned to the Source side of the minimum s-t cut."""
    idx_map = {n: i for i, n in enumerate(nodes)}
    N = len(nodes)
    S = N
    T = N + 1
    adj = [[] for _ in range(N + 2)]

    def add_edge(u, v, cap):
        if cap <= 0.0:
            return
        adj[u].append([v, cap, len(adj[v])])
        adj[v].append([u, 0.0, len(adj[u]) - 1])

    for n, cap in source_caps.items():
        add_edge(S, idx_map[n], cap)
    for n, cap in sink_caps.items():
        add_edge(idx_map[n], T, cap)
    for u, v, cap in edges_cap:
        iu, iv = idx_map[u], idx_map[v]
        add_edge(iu, iv, cap)
        add_edge(iv, iu, cap)

    INF = 1e12
    while True:
        level = [-1] * (N + 2)
        level[S] = 0
        q = collections.deque([S])
        while q:
            u = q.popleft()
            for v, cap, _ in adj[u]:
                if cap > 1e-12 and level[v] < 0:
                    level[v] = level[u] + 1
                    q.append(v)
        if level[T] < 0:
            break
        it = [0] * (N + 2)
        def dfs(u, pushed):
            if u == T:
                return pushed
            while it[u] < len(adj[u]):
                e = adj[u][it[u]]
                v, cap, rev = e
                if cap > 1e-12 and level[v] == level[u] + 1:
                    tr = dfs(v, min(pushed, cap))
                    if tr > 1e-12:
                        e[1] -= tr
                        adj[v][rev][1] += tr
                        return tr
                it[u] += 1
            return 0.0
        while dfs(S, INF) > 1e-12:
            pass

    # BFS on residual graph from S to recover S-side partition
    vis = [False] * (N + 2)
    vis[S] = True
    q = collections.deque([S])
    while q:
        u = q.popleft()
        for v, cap, _ in adj[u]:
            if cap > 1e-12 and not vis[v]:
                vis[v] = True
                q.append(v)
    return {nodes[i] for i in range(N) if vis[i]}

def refine_cut_with_mincut(face_label, label_a, label_b, signed_dist_fn, band_half_width, prior_weight=0.04):
    """Snap boundary between label_a (d < 0) and label_b (d >= 0) into concave seams via dual-graph min-cut."""
    INF = 1e6
    cand = [i for i, l in enumerate(face_label) if l in (label_a, label_b)]
    band_nodes = []
    band_set = set()
    for fi in cand:
        d = signed_dist_fn(face_centroids[fi])
        if abs(d) <= band_half_width:
            band_nodes.append(fi)
            band_set.add(fi)
    if not band_nodes:
        return

    source_caps = collections.defaultdict(float)
    sink_caps = collections.defaultdict(float)
    edges_cap = []
    seen_pairs = set()

    for u in band_nodes:
        d = signed_dist_fn(face_centroids[u])
        # Mild linear prior toward target plane so flat areas stay clean while concave seams dominate
        if d < 0:
            source_caps[u] += prior_weight * abs(d)
        else:
            sink_caps[u] += prior_weight * abs(d)

        for v, cost, _, _ in face_adj[u]:
            lv = face_label[v]
            if v in band_set:
                pair = (min(u, v), max(u, v))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    edges_cap.append((u, v, cost))
            elif lv == label_a:
                source_caps[u] += INF
            elif lv == label_b:
                sink_caps[u] += INF

    s_side = dinic_min_cut(band_nodes, edges_cap, source_caps, sink_caps)
    for fi in band_nodes:
        face_label[fi] = label_a if fi in s_side else label_b

# Initial coarse face labeling
face_label = []
for i, f in enumerate(faces):
    c = face_centroids[i]
    x, y, z = c.x, c.y, c.z
    if has_embedded_equip and (f[0] in shield_ids):
        label = 'shield'
    elif has_embedded_equip and (x < -.27 and -.65 < z < .30 and ((z > -.11 and y < .10 - .40 * z) or (z <= -.11 and (x < -.44 or y < -.03)))):
        label = 'rifle'
    elif rigid_features:
        # Sentinel natural anatomical regions (refined by concavity-guided min-cut below)
        in_right_arm = (not (z > 0.65 and x > -0.22 and y > 0.125)) and poly_inside(x, z, right_outline)
        in_left_arm = (not (z > 0.65 and x < 0.22 and y > 0.125)) and poly_inside(x, z, left_outline)
        if in_right_arm:
            label = 'rightUpperArm' if z > r_z_upper else 'rightForearm' if z > r_z_fore else 'rightPalm'
        elif in_left_arm:
            label = 'leftUpperArm' if z > l_z_upper else 'leftForearm' if z > l_z_fore else 'leftPalm'
        elif z > 0.728 and abs(x) < 0.122 and y < 0.135:
            label = 'headPart'
        elif z > z_torso_split:
            label = 'chestPart'
        elif z >= z_hip_split or (abs(x) < 0.052 and z > 0.005):
            # Pelvis & skirt region: separate front L/R skirts and side L/R skirts from center crotch + back skirt
            if -0.200 <= x <= -0.049 and y < -0.092 and 0.124 <= z <= 0.322:
                label = 'frontRightSkirtPart'
            elif 0.049 <= x <= 0.200 and y < -0.092 and 0.124 <= z <= 0.322:
                label = 'frontLeftSkirtPart'
            elif x < -0.190 and -0.140 <= y <= 0.095 and 0.090 <= z <= 0.322:
                label = 'sideRightSkirtPart'
            elif x > 0.190 and -0.140 <= y <= 0.095 and 0.090 <= z <= 0.322:
                label = 'sideLeftSkirtPart'
            else:
                label = 'waistPart'
        else:
            # Exact planar bisection cut along the natural diagonal kneecap-to-thigh seam
            knee_cut_z = KNEE_PLANE_Z0 - KNEE_PLANE_SLOPE_Y * y
            if x < 0.0:
                if z > knee_cut_z:
                    label = 'rightThigh'
                elif z > z_ankle_split:
                    label = 'rightShin'
                else:
                    label = 'rightFoot'
            else:
                if z > knee_cut_z:
                    label = 'leftThigh'
                elif z > z_ankle_split:
                    label = 'leftShin'
                else:
                    label = 'leftFoot'
    else:
        if (x < -.17 and y > .10 and .53 < z < .75) and poly_inside(x, z, right_outline):
            label = 'rightUpperArm' if z > r_z_upper else 'rightForearm' if z > r_z_fore else 'rightPalm'
        elif (not (z > .685 and y > .07 and x < .33)) and ((x > .17 and y < .08 and .53 < z < .73) or poly_inside(x, z, left_outline)):
            label = 'leftUpperArm' if z > l_z_upper else 'leftForearm' if z > l_z_fore else 'leftPalm'
        elif z > .665 and abs(x) < .145 and y < .22:
            label = 'headPart'
        elif z < z_hip_split:
            if x < 0.0:
                label = 'rightThigh' if z > z_knee_split else 'rightShin' if z > z_ankle_split else 'rightFoot'
            else:
                label = 'leftThigh' if z > z_knee_split else 'leftShin' if z > z_ankle_split else 'leftFoot'
        elif z < z_torso_split:
            label = 'waistPart'
        else:
            label = 'chestPart'
    face_label.append(label)

# Apply concavity-guided dual-graph min-cut refinement along every joint boundary on Sentinel
if rigid_features:
    # 1. Waist seam (waistPart <-> chestPart): narrow red abdomen above white skirts
    refine_cut_with_mincut(face_label, 'waistPart', 'chestPart', lambda c: c.z - 0.334, 0.024, 0.05)
    # 2. Neck seam (chestPart <-> headPart): black neck column above yellow collar
    refine_cut_with_mincut(face_label, 'chestPart', 'headPart', lambda c: c.z - 0.728, 0.022, 0.06)
    # 3. Shoulder seams (chestPart <-> rightUpperArm / leftUpperArm): deep vertical groove between blue chest & white pauldron
    refine_cut_with_mincut(face_label, 'chestPart', 'rightUpperArm', lambda c: -0.197 - c.x, 0.018, 0.08)
    refine_cut_with_mincut(face_label, 'chestPart', 'leftUpperArm', lambda c: c.x - 0.197, 0.018, 0.08)
    # 4. Elbow seams (rightUpperArm <-> rightForearm, left): black corrugated ring above circular hinge disc
    refine_cut_with_mincut(face_label, 'rightUpperArm', 'rightForearm', lambda c: 0.452 - c.z, 0.024, 0.05)
    refine_cut_with_mincut(face_label, 'leftUpperArm', 'leftForearm', lambda c: 0.452 - c.z, 0.024, 0.05)
    # 5. Wrist seams (rightForearm <-> rightPalm, left): sharp cuff-to-fist groove
    refine_cut_with_mincut(face_label, 'rightForearm', 'rightPalm', lambda c: 0.134 - c.z, 0.018, 0.08)
    refine_cut_with_mincut(face_label, 'leftForearm', 'leftPalm', lambda c: 0.134 - c.z, 0.018, 0.08)
    # 6. Hip seams (waistPart <-> rightThigh / leftThigh): black inner hip cavity below skirts
    refine_cut_with_mincut(face_label, 'waistPart', 'rightThigh', lambda c: 0.118 - c.z, 0.024, 0.05)
    refine_cut_with_mincut(face_label, 'waistPart', 'leftThigh', lambda c: 0.118 - c.z, 0.024, 0.05)
    # 7. Front skirts vs chestPart, waistPart, and thighs
    refine_cut_with_mincut(face_label, 'frontRightSkirtPart', 'chestPart', lambda c: max(c.z - 0.320, c.y - (-0.095)), 0.028, 0.08)
    refine_cut_with_mincut(face_label, 'frontLeftSkirtPart', 'chestPart', lambda c: max(c.z - 0.320, c.y - (-0.095)), 0.028, 0.08)
    refine_cut_with_mincut(face_label, 'waistPart', 'frontRightSkirtPart', lambda c: (-0.050 - c.x) if c.x > -0.12 else (c.x - (-0.200)), 0.018, 0.08)
    refine_cut_with_mincut(face_label, 'waistPart', 'frontLeftSkirtPart', lambda c: (c.x - 0.050) if c.x < 0.12 else (0.200 - c.x), 0.018, 0.08)
    refine_cut_with_mincut(face_label, 'rightThigh', 'frontRightSkirtPart', lambda c: c.z - 0.128, 0.020, 0.08)
    refine_cut_with_mincut(face_label, 'leftThigh', 'frontLeftSkirtPart', lambda c: c.z - 0.128, 0.020, 0.08)
    # 8. Side skirts vs front skirts & rear waistPart
    refine_cut_with_mincut(face_label, 'frontRightSkirtPart', 'sideRightSkirtPart', lambda c: -0.196 - c.x, 0.016, 0.08)
    refine_cut_with_mincut(face_label, 'frontLeftSkirtPart', 'sideLeftSkirtPart', lambda c: c.x - 0.196, 0.016, 0.08)
    refine_cut_with_mincut(face_label, 'waistPart', 'sideRightSkirtPart', lambda c: 0.095 - c.y, 0.024, 0.08)
    refine_cut_with_mincut(face_label, 'waistPart', 'sideLeftSkirtPart', lambda c: 0.095 - c.y, 0.024, 0.08)
    # 9. Knee seams already cleanly bisected along the exact slanted kneecap plane (no sawtooth min-cut)
    # 10. Ankle seams (rightShin <-> rightFoot, left): black ankle opening between white shin cuff & white ankle collar
    refine_cut_with_mincut(face_label, 'rightShin', 'rightFoot', lambda c: -0.742 - c.z, 0.024, 0.06)
    refine_cut_with_mincut(face_label, 'leftShin', 'leftFoot', lambda c: -0.742 - c.z, 0.024, 0.06)

# Connected-component cleanup across all parts so no disconnected fragments remain.
vert_faces = collections.defaultdict(list)
for i, f in enumerate(faces):
    for v in f:
        vert_faces[v].append(i)

def face_components(ids):
    todo = set(ids)
    groups = []
    while todo:
        stack = [todo.pop()]
        part = []
        while stack:
            i = stack.pop()
            part.append(i)
            for v in faces[i]:
                for n in vert_faces[v]:
                    if n in todo:
                        todo.remove(n)
                        stack.append(n)
        groups.append(part)
    return sorted(groups, key=len, reverse=True)

cleanup = []
for _ in range(10):
    changed = False
    for name in part_names:
        ids = [i for i, l in enumerate(face_label) if l == name]
        groups = face_components(ids)
        if len(groups) <= 1:
            continue
        for g in groups[1:]:
            g_set = set(g)
            neighbor_counts = collections.Counter()
            for fi in g:
                for v in faces[fi]:
                    for nfi in vert_faces[v]:
                        if nfi not in g_set and face_label[nfi] != name:
                            neighbor_counts[face_label[nfi]] += 1
            if neighbor_counts:
                dest = neighbor_counts.most_common(1)[0][0]
                for fi in g:
                    face_label[fi] = dest
                cleanup.append({'from': name, 'to': dest, 'faces': len(g)})
                changed = True
    if not changed:
        break

labels = {name: [i for i, l in enumerate(face_label) if l == name] for name in part_names}

# Measure cut-loop concavity and perimeter statistics across every pair of adjacent parts
cut_loop_stats = collections.defaultdict(lambda: {'edges': 0, 'concave_edges': 0, 'perimeter_m': 0.0, 'sum_x': 0.0, 'sum_y': 0.0, 'sum_z': 0.0})
for (fa, fb), (elen, ang) in edge_dihedral.items():
    la, lb = face_label[fa], face_label[fb]
    if la != lb:
        pair_key = f"{min(la, lb)} <-> {max(la, lb)}"
        st = cut_loop_stats[pair_key]
        st['edges'] += 1
        if ang < -0.12:
            st['concave_edges'] += 1
        st['perimeter_m'] += elen
        mid = 0.5 * (face_centroids[fa] + face_centroids[fb])
        st['sum_x'] += mid.x
        st['sum_y'] += mid.y
        st['sum_z'] += mid.z

cut_summary = {}
for k, st in sorted(cut_loop_stats.items()):
    n = max(1, st['edges'])
    cut_summary[k] = {
        'edges': st['edges'],
        'concave_fraction': round(st['concave_edges'] / n, 3),
        'perimeter_m': round(st['perimeter_m'], 4),
        'mean_center': [round(st['sum_x'] / n, 4), round(st['sum_y'] / n, 4), round(st['sum_z'] / n, 4)],
    }

# Smooth LBS weights (15 primary joints, computed on original unsplit vertex indices for Smooth LBS / Three.js comparison)
lbs_bone_for = {
    'waistPart': 'pelvis',
    'frontRightSkirtPart': 'pelvis',
    'frontLeftSkirtPart': 'pelvis',
    'sideRightSkirtPart': 'pelvis',
    'sideLeftSkirtPart': 'pelvis',
    'chestPart': 'torso',
    'headPart': 'head',
    'rightUpperArm': 'rightShoulder',
    'rightForearm': 'rightElbow',
    'rightPalm': 'rightWrist',
    'leftUpperArm': 'leftShoulder',
    'leftForearm': 'leftElbow',
    'leftPalm': 'leftWrist',
    'rightThigh': 'rightHip',
    'rightShin': 'rightKnee',
    'rightFoot': 'rightAnkle',
    'leftThigh': 'leftHip',
    'leftShin': 'leftKnee',
    'leftFoot': 'leftAnkle',
    'rifle': 'rightWrist',
    'shield': 'leftElbow',
}

# Rigid armor primary bone per part (includes the 4 secondary skirt bones)
rigid_bone_for = dict(lbs_bone_for)
if rigid_features:
    rigid_bone_for['frontRightSkirtPart'] = 'frontRightSkirt'
    rigid_bone_for['frontLeftSkirtPart'] = 'frontLeftSkirt'
    rigid_bone_for['sideRightSkirtPart'] = 'sideRightSkirt'
    rigid_bone_for['sideLeftSkirtPart'] = 'sideLeftSkirt'

scores = [collections.defaultdict(float) for _ in verts]
for label, ids in labels.items():
    for i in ids:
        f = faces[i]
        area = max((verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[0]]).length / 2.0, 1e-10)
        for j in f:
            scores[j][lbs_bone_for[label]] += area

weights = []
for s in scores:
    total = sum(s.values())
    weights.append({k: v / total for k, v in s.items()})

# Smooth only a narrow 2-ring topological band around mixed boundaries (used in Smooth LBS / Three.js comparison modes)
adjacency = [set() for _ in verts]
for f in faces:
    for i in f:
        adjacency[i].update(j for j in f if j != i)

boundary = {i for i, w in enumerate(weights) if len(w) > 1}
for _ in range(2):
    active = boundary | {j for i in boundary for j in adjacency[i]}
    updated = [dict(w) for w in weights]
    for i in active:
        acc = collections.defaultdict(float)
        for b, w in weights[i].items():
            acc[b] += 0.5 * w
        for j in adjacency[i]:
            for b, w in weights[j].items():
                acc[b] += 0.5 * w / max(1, len(adjacency[i]))
        tot = sum(acc.values())
        updated[i] = {b: w / tot for b, w in acc.items() if w > 1e-8}
    weights = updated

weapon_vertices = set()
if has_embedded_equip:
    weapon_vertices = {v for i in labels['rifle'] for v in faces[i]}
    for i in weapon_vertices:
        weights[i] = {'rightWrist': 1.0}

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

root = bpy.data.objects.new('displayRoot', None)
bpy.context.collection.objects.link(root)
root.location.z = -min(v.z for v in verts)

armdata = bpy.data.armatures.new('FullBodySkeleton')
arm = bpy.data.objects.new('FullBodySkeleton', armdata)
bpy.context.collection.objects.link(arm)
arm.parent = root
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

parent_names = {
    'torso': 'pelvis',
    'head': 'torso',
    'rightShoulder': 'torso',
    'rightElbow': 'rightShoulder',
    'rightWrist': 'rightElbow',
    'leftShoulder': 'torso',
    'leftElbow': 'leftShoulder',
    'leftWrist': 'leftElbow',
    'rightHip': 'pelvis',
    'rightKnee': 'rightHip',
    'rightAnkle': 'rightKnee',
    'leftHip': 'pelvis',
    'leftKnee': 'leftHip',
    'leftAnkle': 'leftKnee',
}
if rigid_features:
    parent_names.update({
        'frontRightSkirt': 'pelvis',
        'frontLeftSkirt': 'pelvis',
        'sideRightSkirt': 'pelvis',
        'sideLeftSkirt': 'pelvis',
    })

for name, pos in positions.items():
    b = armdata.edit_bones.new(name)
    b.head = pos
    b.tail = pos + Vector((0, 0, .08))
    b.use_deform = True
    if name in parent_names:
        b.parent = armdata.edit_bones[parent_names[name]]

bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

def socket(name, bone, pos):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = Matrix.Translation(pos + root.location)
    return ob

right = socket('rightHand', 'rightWrist', grip)
socket('leftHand', 'leftWrist', left_grip)
socket('leftForearmSocket' if rigid_features else 'leftForearm', 'leftElbow', cfg['left_forearm_socket'])
socket('back', 'torso', cfg['back_socket'])

offset = None
if has_embedded_equip:
    barrel = cfg['barrel_dir'].normalized()
    q = Vector((0, -1, 0)).rotation_difference(barrel)
    right.matrix_world = Matrix.Translation(grip + root.location) @ q.to_matrix().to_4x4()
    offset = bpy.data.objects.new('rifleOffset', None)
    bpy.context.collection.objects.link(offset)
    offset.parent = right
    offset.rotation_mode = 'QUATERNION'
    offset.rotation_quaternion = q.inverted()

# Dark metallic inner-frame material for general cut caps and joint fillers,
# plus lighter gunmetal mechanical frame material for the knee joint assembly.
inner_frame_mat = None
knee_frame_mat = None
if rigid_features:
    inner_frame_mat = bpy.data.materials.new('InnerFrameMaterial')
    inner_frame_mat.use_nodes = True
    bsdf = inner_frame_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.06, 0.07, 0.09, 1.0)
        bsdf.inputs['Metallic'].default_value = 0.35
        bsdf.inputs['Roughness'].default_value = 0.72
    knee_frame_mat = bpy.data.materials.new('KneeFrameMaterial')
    knee_frame_mat.use_nodes = True
    kbsdf = knee_frame_mat.node_tree.nodes.get('Principled BSDF')
    if kbsdf:
        kbsdf.inputs['Base Color'].default_value = (0.20, 0.23, 0.27, 1.0)
        kbsdf.inputs['Metallic'].default_value = 0.45
        kbsdf.inputs['Roughness'].default_value = 0.58

def build_boundary_cap_object(label, part_mesh_data, bone_name):
    """Find every open boundary loop on part_mesh_data and close it with an outward-oriented dark inner-frame fan."""
    bm_part = bmesh.new()
    bm_part.from_mesh(part_mesh_data)
    bm_part.edges.ensure_lookup_table()
    bm_part.verts.ensure_lookup_table()

    # Collect directed boundary half-edges: oriented opposite to the adjacent shell face so the cap closes outward
    next_map = collections.defaultdict(list)
    for e in bm_part.edges:
        if len(e.link_faces) == 1:
            f = e.link_faces[0]
            v0, v1 = e.verts[0], e.verts[1]
            # Check order of (v0, v1) inside f.verts
            fv = list(f.verts)
            idx0 = fv.index(v0)
            if fv[(idx0 + 1) % len(fv)] == v1:
                # Face uses v0 -> v1, so cap must use v1 -> v0
                next_map[v1.index].append(v0.index)
            else:
                next_map[v0.index].append(v1.index)

    vert_coords = [v.co.copy() for v in bm_part.verts]
    bm_part.free()

    visited_edges = set()
    loops = []
    for start_u, nbrs in next_map.items():
        for start_v in nbrs:
            if (start_u, start_v) in visited_edges:
                continue
            loop = [start_u]
            u, v = start_u, start_v
            visited_edges.add((u, v))
            guard = 0
            while v != start_u and guard < 10000:
                guard += 1
                loop.append(v)
                nxt = None
                for cand in next_map.get(v, []):
                    if (v, cand) not in visited_edges:
                        nxt = cand
                        break
                if nxt is None:
                    break
                visited_edges.add((v, nxt))
                u, v = v, nxt
            if len(loop) >= 3 and v == start_u:
                loops.append(loop)

    if not loops:
        return None, 0, 0

    cap_verts = []
    cap_faces = []
    for loop in loops:
        base_idx = len(cap_verts)
        pts = [vert_coords[vi] for vi in loop]
        centroid = sum(pts, Vector()) / len(pts)
        for pt in pts:
            cap_verts.append(pt)
        center_idx = len(cap_verts)
        cap_verts.append(centroid)
        k = len(loop)
        for j in range(k):
            cap_faces.append((base_idx + j, base_idx + (j + 1) % k, center_idx))

    cap_data = bpy.data.meshes.new(f'{label}_capMesh')
    cap_data.from_pydata(cap_verts, [], cap_faces)
    cap_data.update()
    cap_mat = knee_frame_mat if (knee_frame_mat is not None and label in ('rightThigh', 'leftThigh', 'rightShin', 'leftShin')) else inner_frame_mat
    cap_data.materials.append(cap_mat)
    cap_ob = bpy.data.objects.new(f'{label}_cap', cap_data)
    bpy.context.collection.objects.link(cap_ob)
    cap_ob.parent = arm
    for bname in positions:
        vg = cap_ob.vertex_groups.new(name=bname)
        if bname == bone_name:
            vg.add(list(range(len(cap_verts))), 1.0, 'REPLACE')
    mod = cap_ob.modifiers.new('RigidCapSkin', 'ARMATURE')
    mod.object = arm
    return cap_ob, len(loops), len(cap_faces)

parts = {}
cap_stats = {}
seam_records = collections.defaultdict(list)
for label, ids in labels.items():
    used = sorted({v for i in ids for v in faces[i]})
    mapping = {v: j for j, v in enumerate(used)}
    pivot = grip if label == 'rifle' else Vector()
    data = bpy.data.meshes.new(label + 'Mesh')
    data.from_pydata([verts[v] - pivot for v in used], [], [[mapping[v] for v in faces[i]] for i in ids])
    data.update()
    data.materials.append(material)
    uv = data.uv_layers.new(name='UVMap')
    loop_normals = []
    for f, i in zip(data.polygons, ids):
        for li, co in zip(f.loop_indices, uvs[i]):
            uv.data[li].uv = co
        f.use_smooth = True
        loop_normals.extend(normals[i])
    data.normals_split_custom_set(loop_normals)
    ob = bpy.data.objects.new(label, data)
    bpy.context.collection.objects.link(ob)
    parts[label] = ob
    if label == 'rifle' and offset is not None:
        ob.parent = offset
    else:
        ob.parent = arm
        for bone in positions:
            vg = ob.vertex_groups.new(name=bone)
            for src, local in mapping.items():
                w = weights[src].get(bone, 0.0)
                if w > 0:
                    vg.add([local], w, 'REPLACE')
        mod = ob.modifiers.new('SharedBoundarySkin', 'ARMATURE')
        mod.object = arm
        for src, local in mapping.items():
            seam_records[src].append((label, local))
        if rigid_features:
            cap_ob, n_loops, n_tris = build_boundary_cap_object(label, data, rigid_bone_for[label])
            cap_stats[label] = {'loops_capped': n_loops, 'cap_triangles': n_tris}

# Create dark-gray inner-frame joint fillers parented to each joint's parent bone
filler_report = []
if rigid_features:
    for spec in cfg['joint_fillers']:
        bm_f = bmesh.new()
        if spec['shape'] == 'sphere':
            bmesh.ops.create_uvsphere(bm_f, u_segments=18, v_segments=12, radius=spec['radius'])
        else:
            bmesh.ops.create_cone(
                bm_f,
                cap_ends=True,
                cap_tris=True,
                segments=20,
                radius1=spec['radius'],
                radius2=spec['radius'],
                depth=spec['depth'],
            )
            if spec.get('axis') == 'X':
                bmesh.ops.rotate(bm_f, verts=bm_f.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2.0, 3, 'Y'))
            elif spec.get('axis') == 'Y':
                bmesh.ops.rotate(bm_f, verts=bm_f.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2.0, 3, 'X'))
        bmesh.ops.triangulate(bm_f, faces=bm_f.faces)
        fdata = bpy.data.meshes.new(spec['name'] + 'Mesh')
        bm_f.to_mesh(fdata)
        bm_f.free()
        for poly in fdata.polygons:
            poly.use_smooth = True
        fmat = knee_frame_mat if (knee_frame_mat is not None and spec.get('material') == 'knee_frame') else inner_frame_mat
        fdata.materials.append(fmat)
        fob = bpy.data.objects.new(spec['name'], fdata)
        bpy.context.collection.objects.link(fob)
        fob.parent = arm
        fob.parent_type = 'BONE'
        fob.parent_bone = spec['parent']
        bpy.context.view_layer.update()
        fob.matrix_world = Matrix.Translation(Vector(spec['center']) + root.location)
        filler_report.append({
            'name': spec['name'],
            'parent': spec['parent'],
            'shape': spec['shape'],
            'center': list(spec['center']),
            'radius_m': spec['radius'],
            'depth_m': spec.get('depth'),
            'axis': spec.get('axis'),
            'triangles': len(fdata.polygons),
        })

def joint_euler_rad(name, deg):
    r = math.radians(deg)
    if name in ('pelvis', 'torso', 'head'):
        return (0.0, r, 0.0)
    if name in ('rightWrist', 'leftWrist'):
        return (0.0, 0.0, r)
    if name in ('rightKnee', 'leftKnee'):
        return (r, 0.0, 0.0)
    return (-r, 0.0, 0.0)

test_poses = [
    ('bind', 'Bind / Rest Pose', {}),
    ('rightArmAim', 'Right Arm Rifle Aim', {'rightShoulder': 30, 'rightElbow': 55, 'rightWrist': 10}),
    ('leftArmGuard', 'Left Arm Shield Guard', {'leftShoulder': 35, 'leftElbow': 65, 'leftWrist': -15}),
    ('dualArmReady', 'Both Arms Combat Ready', {'rightShoulder': 45, 'rightElbow': 75, 'rightWrist': 15, 'leftShoulder': 40, 'leftElbow': 60, 'leftWrist': -15}),
    ('torsoTwist', 'Pelvis & Torso Counter-Twist', {'pelvis': -15, 'torso': 30, 'head': -25, 'rightShoulder': 20, 'rightElbow': 40, 'leftShoulder': 20, 'leftElbow': 35}),
    ('crouch', 'Symmetric Tactical Crouch', {'rightHip': 20, 'rightKnee': 40, 'rightAnkle': 20, 'leftHip': 20, 'leftKnee': 40, 'leftAnkle': 20, 'rightShoulder': 25, 'rightElbow': 45, 'leftShoulder': 20, 'leftElbow': 40}),
    ('deepCrouchAim', 'Deep Crouch + Dual Arm Aim/Guard', {'rightHip': 27, 'rightKnee': 54, 'rightAnkle': 27, 'leftHip': 27, 'leftKnee': 54, 'leftAnkle': 27, 'torso': 15, 'head': -15, 'rightShoulder': 50, 'rightElbow': 80, 'rightWrist': 15, 'leftShoulder': 40, 'leftElbow': 70, 'leftWrist': -10}),
    ('fullBodyTwistCrouch', 'Full-Body Twist + Crouch + Both Arms', {'pelvis': 20, 'torso': -30, 'head': 25, 'rightHip': 18, 'rightKnee': 36, 'rightAnkle': 18, 'leftHip': 18, 'leftKnee': 36, 'leftAnkle': 18, 'rightShoulder': 40, 'rightElbow': 65, 'rightWrist': -10, 'leftShoulder': 30, 'leftElbow': 55, 'leftWrist': 15}),
    ('maxArticulation', 'All 15 Joints Active Near Limits', {'pelvis': -25, 'torso': 35, 'head': -35, 'rightShoulder': 55, 'rightElbow': 85, 'rightWrist': 20, 'leftShoulder': 55, 'leftElbow': 80, 'leftWrist': -20, 'rightHip': 27, 'rightKnee': 54, 'rightAnkle': 27, 'leftHip': 27, 'leftKnee': 54, 'leftAnkle': 27}),
]

sorted_weapon_vertices = sorted(weapon_vertices)
weapon_index_map = {src: idx for idx, src in enumerate(sorted_weapon_vertices)}

bpy.context.view_layer.update()
bind_ankle_world_z = min(
    (arm.matrix_world @ arm.pose.bones['leftAnkle'].head).z,
    (arm.matrix_world @ arm.pose.bones['rightAnkle'].head).z,
)

checks = []
for pose_id, pose_label, angles in test_poses:
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
    for name, deg in angles.items():
        arm.pose.bones[name].rotation_euler = joint_euler_rad(name, deg)
    bpy.context.view_layer.update()
    posed_ankle_world_z = min(
        (arm.matrix_world @ arm.pose.bones['leftAnkle'].head).z,
        (arm.matrix_world @ arm.pose.bones['rightAnkle'].head).z,
    )
    pelvis_dz = bind_ankle_world_z - posed_ankle_world_z
    arm.pose.bones['pelvis'].location = (0.0, pelvis_dz, 0.0)
    bpy.context.view_layer.update()

    dg = bpy.context.evaluated_depsgraph_get()
    evaluated = {name: ob.evaluated_get(dg) for name, ob in parts.items()}
    evaluated_meshes = {name: ob.to_mesh() for name, ob in evaluated.items()}
    worst = 0.0
    count = 0
    for src, records in seam_records.items():
        samples = [evaluated[name].matrix_world @ evaluated_meshes[name].vertices[idx].co for name, idx in records]
        if has_embedded_equip and src in weapon_index_map:
            wi = weapon_index_map[src]
            samples.append(evaluated['rifle'].matrix_world @ evaluated_meshes['rifle'].vertices[wi].co)
        if len(samples) > 1:
            count += 1
            worst = max(worst, max((pt - samples[0]).length for pt in samples))

    left_foot_min_z = min((evaluated['leftFoot'].matrix_world @ v.co).z for v in evaluated_meshes['leftFoot'].vertices)
    right_foot_min_z = min((evaluated['rightFoot'].matrix_world @ v.co).z for v in evaluated_meshes['rightFoot'].vertices)
    for ob in evaluated.values():
        ob.to_mesh_clear()

    checks.append({
        'id': pose_id,
        'label': pose_label,
        'angles_deg': angles,
        'shared_vertices_checked': count,
        'max_boundary_separation_m': worst,
        'max_boundary_separation_mm': worst * 1000.0,
        'pelvis_vertical_offset_m': pelvis_dz,
        'left_foot_min_height_m': left_foot_min_z,
        'right_foot_min_height_m': right_foot_min_z,
    })
    if worst > 1e-5:
        raise RuntimeError(f'Shared boundary validation failed on {pose_id}: {worst}')
    if abs(min(left_foot_min_z, right_foot_min_z)) > 1e-4:
        raise RuntimeError(f'Supporting foot left platform on {pose_id}: L={left_foot_min_z}, R={right_foot_min_z}')

for pb in arm.pose.bones:
    pb.rotation_euler = (0.0, 0.0, 0.0)
    pb.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

bpy.ops.wm.save_as_mainfile(filepath=str(out / cfg['blend_out']), compress=True)
bpy.ops.export_scene.gltf(
    filepath=str(out / cfg['glb_out']),
    export_format='GLB',
    export_yup=True,
    export_animations=False,
)

limitations = [
    'Rigid armor mode keeps every armor plate strictly rigid (zero triangle strain) with capped cuts, inner-frame joint fillers, and hip-driven secondary skirt armor; smooth LBS mode is retained as a comparison baseline.',
    'Self-collision avoidance is analytic for front/side skirts (k * hipAngle), while extreme combined arm/shoulder postures can still graze adjacent chest or pauldron armor.',
    'Foot grounding shifts the pelvis vertically to keep the supporting foot soles on the platform during symmetric crouches; full analytic two-bone leg IK is deferred to T16.',
    'All outer armor parts share the packed 2K PBR texture atlas; cut caps and joint fillers use a dedicated dark metallic InnerFrameMaterial.',
]

report = {
    'asset': asset_key,
    'source_vertices': len(verts),
    'source_triangles': len(faces),
    'part_triangles': {k: len(v) for k, v in labels.items()},
    'source_faces_preserved': sum(map(len, labels.values())) == len(faces),
    'articulated_joints': list(positions.keys()),
    'joint_hierarchy': parent_names,
    'sockets': ['rightHand', 'leftHand', 'leftForearmSocket' if rigid_features else 'leftForearm', 'back'],
    'cut_loops': cut_summary,
    'knee_bisect': knee_bisect_stats,
    'cap_stats': cap_stats,
    'joint_fillers': filler_report,
    'method': 'Concavity-guided dual-graph min-cut segmentation along natural panel seams, centroid boundary loop capping with InnerFrameMaterial, parented inner-frame joint fillers, and 4 hip-driven secondary skirt armor bones (plus 2-ring smooth LBS weights preserved for comparison mode).',
    'cleanup': cleanup,
    'seam_checks': checks,
    'limitations': limitations,
}
(out / cfg['report_out']).write_text(json.dumps(report, indent=2))
print(json.dumps({
    'asset': asset_key,
    'parts': {k: len(v) for k, v in labels.items()},
    'source_faces_preserved': report['source_faces_preserved'],
    'cap_triangles_total': sum(v['cap_triangles'] for v in cap_stats.values()),
    'fillers_count': len(filler_report),
    'cut_loops': cut_summary,
}, indent=2))
print('FULL_BODY_RIG_COMPLETE')
