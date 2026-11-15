"""Reproducible full-body (15-joint) asset preparation preserving continuous joint boundaries.
Usage: Blender -b SOURCE.blend --disable-autoexec --python scripts/prepare_mecha.py -- --output PROJECT
Original geometry/UVs are preserved. Shared source vertices receive identical skin weights across parts.
"""
import bpy, json, math, sys, argparse, collections
from pathlib import Path
from mathutils import Vector, Matrix

p = argparse.ArgumentParser()
p.add_argument('--output', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(a.output)
for folder in ['assets-src', 'public/assets/models', 'docs/results']:
    (out / folder).mkdir(parents=True, exist_ok=True)

source = bpy.data.objects['Mesh_0']
mesh = source.data
material = mesh.materials[0]
verts = [v.co.copy() for v in mesh.vertices]
faces = [list(f.vertices) for f in mesh.polygons]
uvs = [[tuple(mesh.uv_layers.active.data[i].uv) for i in f.loop_indices] for f in mesh.polygons]
normals = [[tuple(mesh.corner_normals[i].vector) for i in f.loop_indices] for f in mesh.polygons]

grip = Vector((-.435, .110, -.015))
left_grip = Vector((.385, -.165, .015))

right_outline = [
    (-.49, .75), (-.205, .75), (-.225, .54), (-.238, .43), (-.26, .30),
    (-.295, .16), (-.335, .075), (-.335, -.11), (-.53, -.11), (-.53, .2), (-.45, .43),
]
left_outline = [
    (.49, .73), (.205, .73), (.215, .54), (.235, .43), (.255, .30),
    (.265, .16), (.255, .075), (.255, -.06), (.48, -.06), (.48, .2), (.45, .43),
]

def poly_inside(x, z, poly):
    hit = False
    for i, (xa, za) in enumerate(poly):
        xb, zb = poly[i - 1]
        if (za > z) != (zb > z) and x < (xb - xa) * (z - za) / (zb - za) + xa:
            hit = not hit
    return hit

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
shield_ids = set(next(ids for ids in components.values() if len(ids) < 1000))

part_names = [
    'waistPart', 'chestPart', 'headPart',
    'rightUpperArm', 'rightForearm', 'rightPalm',
    'leftUpperArm', 'leftForearm', 'leftPalm',
    'rightThigh', 'rightShin', 'rightFoot',
    'leftThigh', 'leftShin', 'leftFoot',
    'rifle', 'shield',
]

face_label = []
for i, f in enumerate(faces):
    c = sum((verts[j] for j in f), Vector()) / len(f)
    x, y, z = c.x, c.y, c.z
    if f[0] in shield_ids:
        label = 'shield'
    elif x < -.27 and -.65 < z < .30 and ((z > -.11 and y < .10 - .40 * z) or (z <= -.11 and (x < -.44 or y < -.03))):
        label = 'rifle'
    elif (x < -.17 and y > .10 and .53 < z < .75) or poly_inside(x, z, right_outline):
        label = 'rightUpperArm' if z > .405 else 'rightForearm' if z > .085 else 'rightPalm'
    elif not (z > .685 and y > .07 and x < .33) and ((x > .17 and y < .08 and .53 < z < .73) or poly_inside(x, z, left_outline)):
        label = 'leftUpperArm' if z > .405 else 'leftForearm' if z > .085 else 'leftPalm'
    elif z > .665 and abs(x) < .145 and y < .22:
        label = 'headPart'
    elif z < -.035:
        if x < 0:
            label = 'rightThigh' if z > -.38 else 'rightShin' if z > -.72 else 'rightFoot'
        else:
            label = 'leftThigh' if z > -.38 else 'leftShin' if z > -.72 else 'leftFoot'
    elif z < .275:
        label = 'waistPart'
    else:
        label = 'chestPart'
    face_label.append(label)

# Connected-component cleanup across all 17 parts so no disconnected fragments remain.
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
for _ in range(5):
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

# Assign weights on original vertex indices before part separation.
bone_for = {
    'waistPart': 'pelvis',
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

scores = [collections.defaultdict(float) for _ in verts]
for label, ids in labels.items():
    for i in ids:
        f = faces[i]
        area = max((verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[0]]).length / 2.0, 1e-10)
        for j in f:
            scores[j][bone_for[label]] += area

weights = []
for s in scores:
    total = sum(s.values())
    weights.append({k: v / total for k, v in s.items()})

# Smooth only a narrow 2-ring topological band around mixed boundaries; armor interiors stay rigid.
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

# Weapon-boundary vertices must have the exact same rigid wrist transform as the independent rifle.
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

positions = {
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
}

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
socket('back', 'torso', Vector((0, .25, .45)))

barrel = Vector((-.29, -.46, -.81)).normalized()
q = Vector((0, -1, 0)).rotation_difference(barrel)
right.matrix_world = Matrix.Translation(grip + root.location) @ q.to_matrix().to_4x4()
offset = bpy.data.objects.new('rifleOffset', None)
bpy.context.collection.objects.link(offset)
offset.parent = right
offset.rotation_mode = 'QUATERNION'
offset.rotation_quaternion = q.inverted()

parts = {}
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
    if label == 'rifle':
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
    ('crouch', 'Symmetric Tactical Crouch', {'rightHip': 22, 'rightKnee': 44, 'rightAnkle': 22, 'leftHip': 22, 'leftKnee': 44, 'leftAnkle': 22, 'rightShoulder': 25, 'rightElbow': 45, 'leftShoulder': 20, 'leftElbow': 40}),
    ('deepCrouchAim', 'Deep Crouch + Dual Arm Aim/Guard', {'rightHip': 32, 'rightKnee': 64, 'rightAnkle': 32, 'leftHip': 32, 'leftKnee': 64, 'leftAnkle': 32, 'torso': 15, 'head': -15, 'rightShoulder': 50, 'rightElbow': 80, 'rightWrist': 15, 'leftShoulder': 40, 'leftElbow': 70, 'leftWrist': -10}),
    ('fullBodyTwistCrouch', 'Full-Body Twist + Crouch + Both Arms', {'pelvis': 20, 'torso': -30, 'head': 25, 'rightHip': 18, 'rightKnee': 36, 'rightAnkle': 18, 'leftHip': 18, 'leftKnee': 36, 'leftAnkle': 18, 'rightShoulder': 40, 'rightElbow': 65, 'rightWrist': -10, 'leftShoulder': 30, 'leftElbow': 55, 'leftWrist': 15}),
    ('maxArticulation', 'All 15 Joints Active Near Limits', {'pelvis': -25, 'torso': 35, 'head': -35, 'rightShoulder': 55, 'rightElbow': 85, 'rightWrist': 20, 'leftShoulder': 55, 'leftElbow': 80, 'leftWrist': -20, 'rightHip': 30, 'rightKnee': 60, 'rightAnkle': 30, 'leftHip': 30, 'leftKnee': 60, 'leftAnkle': 30}),
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
    # Ground feet on the platform by shifting pelvis along its vertical bone Y axis (+Z world).
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
        if src in weapon_index_map:
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
    if abs(left_foot_min_z) > 1e-4:
        raise RuntimeError(f'Left foot left platform on {pose_id}: {left_foot_min_z}')

for pb in arm.pose.bones:
    pb.rotation_euler = (0.0, 0.0, 0.0)
    pb.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

bpy.ops.wm.save_as_mainfile(filepath=str(out / 'assets-src/mecha-right-arm.blend'))
bpy.ops.export_scene.gltf(
    filepath=str(out / 'public/assets/models/mecha-right-arm.glb'),
    export_format='GLB',
    export_yup=True,
    export_animations=False,
)

limitations = [
    'Two-ring transition bands around the 15 joints stretch slightly at extreme angles near joint limits to preserve C0 surface continuity without opening seams.',
    'Self-collision avoidance is not implemented, so front/side waist skirt armor and shoulder pauldrons can intersect adjacent limbs when hips or shoulders pitch past ~35 deg.',
    'Foot grounding shifts the pelvis vertically to keep the supporting foot soles on the platform during symmetric crouches; full analytic two-bone leg IK is deferred to T16.',
    'All 17 parts currently share the original packed 2K PBR texture atlas; custom regional shader recoloring is deferred to T05.',
]

report = {
    'source_triangles': len(faces),
    'part_triangles': {k: len(v) for k, v in labels.items()},
    'source_faces_preserved': sum(map(len, labels.values())) == len(faces),
    'articulated_joints': list(positions.keys()),
    'joint_hierarchy': parent_names,
    'method': 'Full-body 15-joint hierarchy rooted at pelvis; shared vertex skin weights computed on original vertex indices before part separation, 2-ring joint blend bands with rigid armor interiors, topological connected-component cleanup across 17 parts, and wrist-socket rifle attachment.',
    'cleanup': cleanup,
    'seam_checks': checks,
    'limitations': limitations,
}
(out / 'docs/results/preparation-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
print('FULL_BODY_RIG_COMPLETE')
