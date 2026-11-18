"""High-to-low Cycles texture baking for Gundam Guardian.
Keeps the exact low-poly geometry (14,632 verts, 30,043 tris) from gundam-guardian-source-before.blend,
replaces the decimation-collapsed UV layer with a clean Smart UV Project (66 deg) + high-density single-atlas pack,
and bakes 4096x4096 + 2048x2048 Base Color, Tangent Normal, and MetallicRoughness maps
from the raw 2,002,991-triangle high-poly asset.
"""
import bpy
import json
import math
import time
import numpy as np
from pathlib import Path
from mathutils import Vector

t0 = time.time()
ROOT = Path("/Users/jerrychen/Desktop/cs184/Final_Project")
SCRATCH = Path("/Users/jerrychen/.gemini/antigravity/brain/2c64ccfd-63cb-40c6-8ab4-091146b97356/scratch")
RAW_BLEND = ROOT / "assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend"
LOW_BEFORE_BLEND = SCRATCH / "gundam-guardian-source-before.blend"
LOW_OUT_BLEND = ROOT / "assets-src/gundam-guardian-source.blend"
if not LOW_BEFORE_BLEND.exists():
    LOW_BEFORE_BLEND = LOW_OUT_BLEND
BAKE_DIR = ROOT / "docs/results/guardian-bake"
BAKE_DIR.mkdir(parents=True, exist_ok=True)
TEX_SCRATCH = SCRATCH / "guardian-baked-maps"
TEX_SCRATCH.mkdir(parents=True, exist_ok=True)

CAGE_EXTRUSION_TIGHT = 0.005
MAX_RAY_DISTANCE_TIGHT = 0.016
CAGE_EXTRUSION_WIDE = 0.015
MAX_RAY_DISTANCE_WIDE = 0.035
BAKE_MARGIN_PX = 8
SMART_UV_ANGLE_DEG = 66.0
SMART_UV_MARGIN = 0.0008

print(f"[1/7] Opening low-poly source backup: {LOW_BEFORE_BLEND}")
bpy.ops.wm.open_mainfile(filepath=str(LOW_BEFORE_BLEND))

low_obj = bpy.data.objects["Mesh_0"]
low_obj.name = "GuardianLow"
low_mesh = low_obj.data
low_mesh.name = "GuardianLowMesh"

orig_vert_count = len(low_mesh.vertices)
orig_face_count = len(low_mesh.polygons)
print(f"      Low-poly geometry: {orig_vert_count} verts, {orig_face_count} tris")
assert orig_vert_count == 14632, f"Expected 14632 verts, got {orig_vert_count}"
assert orig_face_count == 30043, f"Expected 30043 faces, got {orig_face_count}"

for img in list(bpy.data.images):
    bpy.data.images.remove(img)

# Step 2: Replace old collapsed UV layer with Smart UV Project (66 deg) and pack all islands into one non-overlapping atlas
print(f"[2/7] Generating new Smart UV Project (angle={SMART_UV_ANGLE_DEG} deg, margin={SMART_UV_MARGIN})...")
while low_mesh.uv_layers:
    low_mesh.uv_layers.remove(low_mesh.uv_layers[0])
new_uv = low_mesh.uv_layers.new(name="UVMap")
low_mesh.uv_layers.active = new_uv
low_mesh.uv_layers.active_index = 0

bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = low_obj
low_obj.select_set(True)
bpy.context.scene.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(
    angle_limit=math.radians(SMART_UV_ANGLE_DEG),
    margin_method="FRACTION",
    island_margin=SMART_UV_MARGIN,
    area_weight=0.0,
    correct_aspect=True,
    scale_to_bounds=True,
)
try:
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin_method="FRACTION",
        margin=SMART_UV_MARGIN,
    )
except Exception as exc:
    print("      pack_islands note:", exc)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.scene.tool_settings.use_uv_select_sync = False

for poly in low_mesh.polygons:
    poly.use_smooth = True

uv_coords = np.empty(len(low_mesh.loops) * 2, dtype=np.float32)
low_mesh.uv_layers.active.data.foreach_get("uv", uv_coords)
uv_coords = uv_coords.reshape(-1, 2)
uv_min = uv_coords.min(axis=0).tolist()
uv_max = uv_coords.max(axis=0).tolist()
unique_uvs = int(len(np.unique(np.round(uv_coords, 4), axis=0)))
print(f"      UV bounds: min={uv_min}, max={uv_max}, unique_uvs={unique_uvs}")

# Step 3: Append High-Poly mesh and material from raw 225 MB .blend (read-only)
print(f"[3/7] Appending high-poly Mesh_0 from {RAW_BLEND.name}...")
with bpy.data.libraries.load(str(RAW_BLEND), link=False) as (data_from, data_to):
    data_to.objects = ["Mesh_0"]

high_obj = data_to.objects[0]
high_obj.name = "GuardianHigh"
bpy.context.collection.objects.link(high_obj)
high_mesh = high_obj.data
high_mat = high_mesh.materials[0]
high_mat.name = "HighPolyMat"
print(f"      High-poly loaded: {len(high_mesh.vertices)} verts, {len(high_mesh.polygons)} tris")

# Configure Cycles + Metal GPU
scene = bpy.context.scene
scene.render.engine = "CYCLES"
cycles_prefs = bpy.context.preferences.addons["cycles"].preferences
gpu_backend = "CPU"
for backend in ("METAL", "CUDA", "OPTIX", "HIP"):
    try:
        cycles_prefs.compute_device_type = backend
        cycles_prefs.get_devices()
        gpu_devs = [d for d in cycles_prefs.devices if d.type != "CPU"]
        if gpu_devs:
            for d in cycles_prefs.devices:
                d.use = (d.type != "CPU")
            scene.cycles.device = "GPU"
            gpu_backend = f"{backend} ({gpu_devs[0].name})"
            break
    except Exception:
        pass
print(f"      Cycles compute device: {gpu_backend}")

scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.render.bake.use_selected_to_active = True
scene.render.bake.use_cage = False
scene.render.bake.margin_type = "ADJACENT_FACES"

low_mat = bpy.data.materials.new(name="Material_0")
low_mesh.materials.clear()
low_mesh.materials.append(low_mat)
low_nodes = low_mat.node_tree.nodes
low_links = low_mat.node_tree.links
target_tex_node = low_nodes.new("ShaderNodeTexImage")
target_tex_node.name = "BakeTarget"

def select_high_to_low(target_image):
    for n in low_nodes:
        n.select = False
    target_tex_node.image = target_image
    target_tex_node.select = True
    low_nodes.active = target_tex_node

    bpy.ops.object.select_all(action="DESELECT")
    high_obj.hide_viewport = False
    high_obj.hide_render = False
    low_obj.hide_viewport = False
    low_obj.hide_render = False
    high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj

hp_nodes = high_mat.node_tree.nodes
hp_links = high_mat.node_tree.links
hp_bsdf = next(n for n in hp_nodes if n.type == "BSDF_PRINCIPLED")
hp_out = next(n for n in hp_nodes if n.type == "OUTPUT_MATERIAL")
hp_sep = next(n for n in hp_nodes if n.type == "SEPARATE_COLOR")
hp_norm_map = next(n for n in hp_nodes if n.type == "NORMAL_MAP")
hp_emit = hp_nodes.new("ShaderNodeEmission")
hp_emit.inputs["Strength"].default_value = 1.0

RES_4K = 4096
RES_2K = 2048

def run_bake_suite(tag, extrusion, max_ray, margin_px):
    print(f"      --- Running bake pass '{tag}' (extrusion={extrusion}m, max_ray={max_ray}m, margin={margin_px}px) ---")
    scene.render.bake.cage_extrusion = extrusion
    scene.render.bake.max_ray_distance = max_ray
    scene.render.bake.margin = margin_px

    for l in list(hp_links):
        if l.to_node == hp_bsdf and l.to_socket.name in ("Metallic", "Normal"):
            hp_links.remove(l)
    hp_bsdf.inputs["Metallic"].default_value = 0.0
    hp_links.new(hp_bsdf.outputs["BSDF"], hp_out.inputs["Surface"])

    # a. Base Color (DIFFUSE, color only)
    img_c = bpy.data.images.new(f"c_{tag}", width=RES_4K, height=RES_4K, alpha=False, float_buffer=False)
    img_c.colorspace_settings.name = "sRGB"
    select_high_to_low(img_c)
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE")
    arr_c = np.empty(RES_4K * RES_4K * 4, dtype=np.float32)
    img_c.pixels.foreach_get(arr_c)
    bpy.data.images.remove(img_c)

    # Reconnect Normal Map for Tangent-Space Normal bake
    hp_links.new(hp_norm_map.outputs["Normal"], hp_bsdf.inputs["Normal"])

    # b. Tangent-Space Normal
    img_n = bpy.data.images.new(f"n_{tag}", width=RES_4K, height=RES_4K, alpha=False, float_buffer=False)
    img_n.colorspace_settings.name = "Non-Color"
    select_high_to_low(img_n)
    scene.render.bake.normal_space = "TANGENT"
    scene.render.bake.normal_r = "POS_X"
    scene.render.bake.normal_g = "POS_Y"
    scene.render.bake.normal_b = "POS_Z"
    bpy.ops.object.bake(type="NORMAL")
    arr_n = np.empty(RES_4K * RES_4K * 4, dtype=np.float32)
    img_n.pixels.foreach_get(arr_n)
    bpy.data.images.remove(img_n)

    # c. Roughness & Metallic via Emission
    img_r = bpy.data.images.new(f"r_{tag}", width=RES_4K, height=RES_4K, alpha=False, float_buffer=True)
    img_r.colorspace_settings.name = "Non-Color"
    hp_links.new(hp_sep.outputs["Green"], hp_emit.inputs["Color"])
    hp_links.new(hp_emit.outputs["Emission"], hp_out.inputs["Surface"])
    select_high_to_low(img_r)
    bpy.ops.object.bake(type="EMIT")
    arr_r = np.empty(RES_4K * RES_4K * 4, dtype=np.float32)
    img_r.pixels.foreach_get(arr_r)
    bpy.data.images.remove(img_r)

    img_m = bpy.data.images.new(f"m_{tag}", width=RES_4K, height=RES_4K, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    hp_links.new(hp_sep.outputs["Blue"], hp_emit.inputs["Color"])
    hp_links.new(hp_emit.outputs["Emission"], hp_out.inputs["Surface"])
    select_high_to_low(img_m)
    bpy.ops.object.bake(type="EMIT")
    arr_m = np.empty(RES_4K * RES_4K * 4, dtype=np.float32)
    img_m.pixels.foreach_get(arr_m)
    bpy.data.images.remove(img_m)

    hp_links.new(hp_sep.outputs["Blue"], hp_bsdf.inputs["Metallic"])
    hp_links.new(hp_norm_map.outputs["Normal"], hp_bsdf.inputs["Normal"])
    hp_links.new(hp_bsdf.outputs["BSDF"], hp_out.inputs["Surface"])

    return (
        arr_c.reshape(RES_4K, RES_4K, 4),
        arr_n.reshape(RES_4K, RES_4K, 4),
        arr_r.reshape(RES_4K, RES_4K, 4)[:, :, 0],
        arr_m.reshape(RES_4K, RES_4K, 4)[:, :, 0],
    )

print("[4/7] Baking Pass 1 (tight cage for crevices & overhangs) and Pass 2 (wide cage for decimated ridges)...")
tb = time.time()
c_tight, n_tight, r_tight, m_tight = run_bake_suite("tight", CAGE_EXTRUSION_TIGHT, MAX_RAY_DISTANCE_TIGHT, 4)
c_wide, n_wide, r_wide, m_wide = run_bake_suite("wide", CAGE_EXTRUSION_WIDE, MAX_RAY_DISTANCE_WIDE, BAKE_MARGIN_PX)
print(f"      Both 4K bake suites completed in {time.time() - tb:.1f}s")

print("[5/7] Merging tight + wide passes and healing interior missed-ray pinholes...")
valid_tight = (r_tight > 0.01) & (np.max(c_tight[:, :, :3], axis=-1) > 0.005) & (n_tight[:, :, 2] > 0.50)
valid_wide = (r_wide > 0.01) & (np.max(c_wide[:, :, :3], axis=-1) > 0.005) & (n_wide[:, :, 2] > 0.48)

use_tight = valid_tight
use_wide = (~use_tight) & valid_wide
valid_any = use_tight | use_wide

c_merged = np.where(use_tight[:, :, None], c_tight, np.where(use_wide[:, :, None], c_wide, 0.0))
c_merged[:, :, 3] = 1.0
default_norm = np.array([0.5, 0.5, 1.0, 1.0], dtype=np.float32)
n_merged = np.where(use_tight[:, :, None], n_tight, np.where(use_wide[:, :, None], n_wide, default_norm))
r_merged = np.where(use_tight, r_tight, np.where(use_wide, r_wide, 0.0))
m_merged = np.where(use_tight, m_tight, np.where(use_wide, m_wide, 0.0))

# Heal only interior pinholes (where >= 2 of 4 neighbors are valid) for 3 iterations so background stays clean
mask = valid_any.copy()
for _ in range(3):
    unfilled = ~mask
    m_up = np.pad(mask[1:, :], ((0, 1), (0, 0)), constant_values=False)
    m_dn = np.pad(mask[:-1, :], ((1, 0), (0, 0)), constant_values=False)
    m_lf = np.pad(mask[:, 1:], ((0, 0), (0, 1)), constant_values=False)
    m_rt = np.pad(mask[:, :-1], ((0, 0), (1, 0)), constant_values=False)
    cnt = m_up.astype(np.float32) + m_dn.astype(np.float32) + m_lf.astype(np.float32) + m_rt.astype(np.float32)
    newly_filled = unfilled & (cnt >= 2.0)
    if not np.any(newly_filled):
        break
    inv_cnt = np.where(cnt > 0, 1.0 / np.maximum(cnt, 1.0), 0.0)

    def heal_step(arr, is_3d=True):
        if is_3d:
            s_up = np.pad(arr[1:, :, :], ((0, 1), (0, 0), (0, 0)), mode="edge") * m_up[:, :, None]
            s_dn = np.pad(arr[:-1, :, :], ((1, 0), (0, 0), (0, 0)), mode="edge") * m_dn[:, :, None]
            s_lf = np.pad(arr[:, 1:, :], ((0, 0), (0, 1), (0, 0)), mode="edge") * m_lf[:, :, None]
            s_rt = np.pad(arr[:, :-1, :], ((0, 0), (1, 0), (0, 0)), mode="edge") * m_rt[:, :, None]
            avg = (s_up + s_dn + s_lf + s_rt) * inv_cnt[:, :, None]
            return np.where(newly_filled[:, :, None], avg, arr)
        else:
            s_up = np.pad(arr[1:, :], ((0, 1), (0, 0)), mode="edge") * m_up
            s_dn = np.pad(arr[:-1, :], ((1, 0), (0, 0)), mode="edge") * m_dn
            s_lf = np.pad(arr[:, 1:], ((0, 0), (0, 1)), mode="edge") * m_lf
            s_rt = np.pad(arr[:, :-1], ((0, 0), (1, 0)), mode="edge") * m_rt
            avg = (s_up + s_dn + s_lf + s_rt) * inv_cnt
            return np.where(newly_filled, avg, arr)

    c_merged = heal_step(c_merged, True)
    n_merged = heal_step(n_merged, True)
    r_merged = heal_step(r_merged, False)
    m_merged = heal_step(m_merged, False)
    mask = mask | newly_filled

c_merged[:, :, 3] = 1.0
n_merged[:, :, 3] = 1.0
mr_merged = np.ones((RES_4K, RES_4K, 4), dtype=np.float32)
mr_merged[:, :, 0] = 1.0
mr_merged[:, :, 1] = np.clip(r_merged, 0.0, 1.0)
mr_merged[:, :, 2] = np.clip(m_merged, 0.0, 1.0)
mr_merged[:, :, 3] = 1.0

color_4k_arr = c_merged.astype(np.float32).ravel()
norm_4k_arr = n_merged.astype(np.float32).ravel()
mr_4k_arr = mr_merged.astype(np.float32).ravel()

def save_arr_png(arr_flat, size, name, colorspace, path):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(arr_flat)
    img.update()
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

print("[6/7] Saving 4096 and 2048 baked maps...")
path_color_4k = TEX_SCRATCH / "guardian_basecolor_4096.png"
path_normal_4k = TEX_SCRATCH / "guardian_normal_4096.png"
path_mr_4k = TEX_SCRATCH / "guardian_mr_4096.png"
save_arr_png(color_4k_arr, RES_4K, "save_c4k", "sRGB", path_color_4k)
save_arr_png(norm_4k_arr, RES_4K, "save_n4k", "Non-Color", path_normal_4k)
save_arr_png(mr_4k_arr, RES_4K, "save_mr4k", "Non-Color", path_mr_4k)

def downscale_4k_to_2k(arr_4k_flat, is_normal=False):
    arr_4k = arr_4k_flat.reshape(RES_4K, RES_4K, 4)
    arr_2k = arr_4k.reshape(RES_2K, 2, RES_2K, 2, 4).mean(axis=(1, 3))
    if is_normal:
        n = arr_2k[:, :, :3] * 2.0 - 1.0
        lengths = np.linalg.norm(n, axis=-1, keepdims=True)
        valid = lengths > 0.1
        n = np.where(valid, n / np.maximum(lengths, 1e-6), np.array([0.0, 0.0, 1.0], dtype=np.float32))
        arr_2k[:, :, :3] = np.clip(n * 0.5 + 0.5, 0.0, 1.0)
    arr_2k[:, :, 3] = 1.0
    return arr_2k.astype(np.float32).ravel()

path_color_2k = TEX_SCRATCH / "guardian_basecolor_2048.png"
path_normal_2k = TEX_SCRATCH / "guardian_normal_2048.png"
path_mr_2k = TEX_SCRATCH / "guardian_mr_2048.png"
save_arr_png(downscale_4k_to_2k(color_4k_arr, False), RES_2K, "save_c2k", "sRGB", path_color_2k)
save_arr_png(downscale_4k_to_2k(mr_4k_arr, False), RES_2K, "save_mr2k", "Non-Color", path_mr_2k)
save_arr_png(downscale_4k_to_2k(norm_4k_arr, True), RES_2K, "save_n2k", "Non-Color", path_normal_2k)

img_color_2k = bpy.data.images.load(str(path_color_2k))
img_color_2k.name = "Image_0"
img_color_2k.colorspace_settings.name = "sRGB"
img_color_2k.pack()

img_mr_2k = bpy.data.images.load(str(path_mr_2k))
img_mr_2k.name = "Image_1"
img_mr_2k.colorspace_settings.name = "Non-Color"
img_mr_2k.pack()

img_normal_2k = bpy.data.images.load(str(path_normal_2k))
img_normal_2k.name = "Image_2"
img_normal_2k.colorspace_settings.name = "Non-Color"
img_normal_2k.pack()

# Step 5: Build clean Principled BSDF material on low_obj from the baked 2048 maps
low_nodes.clear()
out_node = low_nodes.new("ShaderNodeOutputMaterial")
bsdf_node = low_nodes.new("ShaderNodeBsdfPrincipled")
tex_color = low_nodes.new("ShaderNodeTexImage")
tex_color.image = img_color_2k
tex_mr = low_nodes.new("ShaderNodeTexImage")
tex_mr.image = img_mr_2k
sep_mr = low_nodes.new("ShaderNodeSeparateColor")
tex_norm = low_nodes.new("ShaderNodeTexImage")
tex_norm.image = img_normal_2k
norm_map = low_nodes.new("ShaderNodeNormalMap")

low_links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])
low_links.new(tex_color.outputs["Color"], bsdf_node.inputs["Base Color"])
low_links.new(tex_mr.outputs["Color"], sep_mr.inputs["Color"])
low_links.new(sep_mr.outputs["Green"], bsdf_node.inputs["Roughness"])
low_links.new(sep_mr.outputs["Blue"], bsdf_node.inputs["Metallic"])
low_links.new(tex_norm.outputs["Color"], norm_map.inputs["Color"])
low_links.new(norm_map.outputs["Normal"], bsdf_node.inputs["Normal"])

# Step 4: Render front/side/back comparisons (raw high-poly on left vs baked low-poly on right)
print("[7/7] Rendering front/side/back comparisons (raw high-poly vs baked low-poly)...")
world = bpy.data.worlds.new("BakeAuditWorld")
scene.world = world
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.14, 0.16, 0.20, 1.0)
    bg.inputs[1].default_value = 1.1

def add_light(name, ltype, energy, loc, rot_deg):
    ld = bpy.data.lights.new(name=name, type=ltype)
    ld.energy = energy
    lo = bpy.data.objects.new(name=name, object_data=ld)
    bpy.context.collection.objects.link(lo)
    lo.location = loc
    lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    return lo

l1 = add_light("Key", "SUN", 3.5, (2.0, -2.5, 3.0), (48, 0, 35))
l2 = add_light("Fill", "SUN", 1.8, (-2.5, -1.5, 1.5), (65, 0, -40))
l3 = add_light("Back", "SUN", 2.2, (0.0, 2.8, 2.2), (-50, 0, 180))

cam_data = bpy.data.cameras.new("CompareCam")
cam_data.lens = 55
cam_obj = bpy.data.objects.new("CompareCam", cam_data)
bpy.context.collection.objects.link(cam_obj)
scene.camera = cam_obj

def look_at(obj, target):
    direction = target - obj.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    obj.rotation_euler = rot_quat.to_euler()

scene.cycles.samples = 16
scene.render.resolution_x = 1800
scene.render.resolution_y = 1200
scene.render.image_settings.file_format = "PNG"

high_obj.location = (-0.72, 0.0, 0.0)
low_obj.location = (0.72, 0.0, 0.0)
cam_obj.location = (0.0, -4.5, 0.0)
look_at(cam_obj, Vector((0.0, 0.0, 0.0)))
scene.render.filepath = str(BAKE_DIR / "compare-front.png")
bpy.ops.render.render(write_still=True)

cam_obj.location = (0.0, 4.5, 0.0)
look_at(cam_obj, Vector((0.0, 0.0, 0.0)))
scene.render.filepath = str(BAKE_DIR / "compare-back.png")
bpy.ops.render.render(write_still=True)

high_obj.location = (0.0, -0.68, 0.0)
low_obj.location = (0.0, 0.68, 0.0)
cam_obj.location = (4.5, 0.0, 0.0)
look_at(cam_obj, Vector((0.0, 0.0, 0.0)))
scene.render.filepath = str(BAKE_DIR / "compare-side.png")
bpy.ops.render.render(write_still=True)

low_obj.location = (0.0, 0.0, 0.0)
low_obj.name = "Mesh_0"
low_mesh.name = "Mesh_0"

for ob in [high_obj, cam_obj, l1, l2, l3]:
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.data.meshes.remove(high_mesh)
bpy.data.materials.remove(high_mat)

keep_images = {img_color_2k, img_mr_2k, img_normal_2k}
for img in list(bpy.data.images):
    if img not in keep_images:
        bpy.data.images.remove(img)

bpy.ops.wm.save_as_mainfile(filepath=str(LOW_OUT_BLEND), compress=True)

nonzero_fraction = float(np.mean(mask))
inverted_norm_fraction = float(np.mean(n_merged[mask][:, 2] < 0.48))

summary = {
    "bake_engine": "CYCLES",
    "compute_device": gpu_backend,
    "samples": 1,
    "selected_to_active": True,
    "cage_extrusion_tight_m": CAGE_EXTRUSION_TIGHT,
    "max_ray_distance_tight_m": MAX_RAY_DISTANCE_TIGHT,
    "cage_extrusion_wide_m": CAGE_EXTRUSION_WIDE,
    "max_ray_distance_wide_m": MAX_RAY_DISTANCE_WIDE,
    "margin_px": BAKE_MARGIN_PX,
    "smart_uv_angle_deg": SMART_UV_ANGLE_DEG,
    "smart_uv_island_margin": SMART_UV_MARGIN,
    "uv_min": uv_min,
    "uv_max": uv_max,
    "unique_uv_coords": unique_uvs,
    "low_poly_vertices": len(low_mesh.vertices),
    "low_poly_triangles": len(low_mesh.polygons),
    "covered_texel_fraction_4k": round(nonzero_fraction, 4),
    "inverted_normal_fraction_4k": round(inverted_norm_fraction, 6),
    "textures_4096_bytes": {
        "basecolor": path_color_4k.stat().st_size,
        "normal": path_normal_4k.stat().st_size,
        "metallicRoughness": path_mr_4k.stat().st_size,
    },
    "textures_2048_bytes": {
        "basecolor": path_color_2k.stat().st_size,
        "normal": path_normal_2k.stat().st_size,
        "metallicRoughness": path_mr_2k.stat().st_size,
    },
    "source_blend_bytes": LOW_OUT_BLEND.stat().st_size,
    "elapsed_seconds": round(time.time() - t0, 2),
}
(BAKE_DIR / "bake-summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print("GUARDIAN_BAKE_COMPLETE")
