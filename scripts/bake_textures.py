"""High-to-low Cycles GPU texture baking and decimation pipeline for Sentinel body and equipment.
Usage:
  Blender -b --disable-autoexec --python scripts/bake_textures.py -- --asset sentinel --stage prep
  Blender -b --disable-autoexec --python scripts/bake_textures.py -- --asset sentinel --stage bake
Does NOT modify any raw Meshy_AI_*.blend file.
"""
import argparse
import bpy
import json
import math
import sys
import time
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path("/Users/jerrychen/Desktop/cs184/Final_Project")
SCRATCH = Path("/Users/jerrychen/.gemini/antigravity/brain/2c64ccfd-63cb-40c6-8ab4-091146b97356/scratch/sentinel-baked-maps")
SCRATCH.mkdir(parents=True, exist_ok=True)
AUDIT_DIR = ROOT / "docs/results/sentinel-audit"
AUDIT_DIR.mkdir(parents=True, exist_ok=True)
THUMB_DIR = ROOT / "public/assets/thumbs"
THUMB_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR = ROOT / "public/assets/models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

parser = argparse.ArgumentParser()
parser.add_argument("--asset", choices=["sentinel", "saber", "shield", "rifle", "all"], default="all")
parser.add_argument("--stage", choices=["prep", "bake"], required=True)
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(argv)

ASSET_SPECS = {
    "sentinel": {
        "raw_blend": ROOT / "assets-src/Meshy_AI_Gundam_Sentinel_20261118_texture.blend",
        "target_tris": 30000,
        "bake_res": 4096,
        "export_res": 2048,
        "tight_extrusion": 0.005,
        "tight_max_ray": 0.016,
        "wide_extrusion": 0.015,
        "wide_max_ray": 0.035,
        "out_blend": ROOT / "assets-src/gundam-sentinel-source.blend",
        "out_glb": None,
    },
    "saber": {
        "raw_blend": ROOT / "assets-src/Meshy_AI_Violet_Saber_Glow_20261118_texture.blend",
        "target_tris": 4200,
        "bake_res": 2048,
        "export_res": 1024,
        "tight_extrusion": 0.004,
        "tight_max_ray": 0.015,
        "wide_extrusion": 0.012,
        "wide_max_ray": 0.030,
        "out_blend": None,
        "out_glb": MODEL_DIR / "equip-beam-saber.glb",
        "thumb": THUMB_DIR / "thumb-saber.png",
    },
    "shield": {
        "raw_blend": ROOT / "assets-src/Meshy_AI_Crimson_Guardian_Shield_20261118_texture.blend",
        "target_tris": 6400,
        "bake_res": 4096,
        "export_res": 2048,
        "tight_extrusion": 0.006,
        "tight_max_ray": 0.018,
        "wide_extrusion": 0.018,
        "wide_max_ray": 0.040,
        "out_blend": None,
        "out_glb": MODEL_DIR / "equip-shield.glb",
        "thumb": THUMB_DIR / "thumb-shield.png",
    },
    "rifle": {
        "raw_blend": ROOT / "assets-src/Meshy_AI_Futuristic_Toy_Blaster_20261118_texture.blend",
        "target_tris": 6500,
        "bake_res": 4096,
        "export_res": 2048,
        "tight_extrusion": 0.005,
        "tight_max_ray": 0.018,
        "wide_extrusion": 0.015,
        "wide_max_ray": 0.038,
        "out_blend": None,
        "out_glb": MODEL_DIR / "equip-rifle.glb",
        "thumb": THUMB_DIR / "thumb-rifle.png",
    },
}

def apply_canonical_equipment_transform(mesh, asset_key):
    if asset_key == "sentinel":
        return
    if asset_key == "saber":
        T = Matrix.Translation(Vector((0.0025, -0.0004, 0.775)))
        R = Matrix.Rotation(math.radians(90.0), 4, "X")
        mesh.transform(R @ T)
    elif asset_key == "rifle":
        T = Matrix.Translation(Vector((-0.415, 0.0, 0.220)))
        R = Matrix.Rotation(math.radians(90.0), 4, "Z")
        mesh.transform(R @ T)
    elif asset_key == "shield":
        T = Matrix.Translation(Vector((0.0, -0.035, -0.050)))
        R = Matrix.Rotation(math.radians(90.0), 4, "Z")
        mesh.transform(R @ T)
    mesh.update()

def prep_low_poly(asset_key):
    spec = ASSET_SPECS[asset_key]
    raw_blend = spec["raw_blend"]
    low_prepped_path = SCRATCH / f"{asset_key}_low_unwrapped.blend"
    print(f"\n[PREP] Decimating and unwrapping '{asset_key}' from {raw_blend.name}...")
    bpy.ops.wm.open_mainfile(filepath=str(raw_blend))

    # Strip large packed textures immediately to free RAM before decimation
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

    obj = bpy.data.objects["Mesh_0"]
    mesh = obj.data
    mesh.materials.clear()
    raw_verts = len(mesh.vertices)
    raw_tris = len(mesh.polygons)

    apply_canonical_equipment_transform(mesh, asset_key)

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = float(spec["target_tris"]) / float(raw_tris)
    bpy.ops.object.modifier_apply(modifier=mod.name)

    low_verts = len(mesh.vertices)
    low_tris = len(mesh.polygons)
    print(f"  Decimated: {raw_tris} tris ({raw_verts} verts) -> {low_tris} tris ({low_verts} verts)")

    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    new_uv = mesh.uv_layers.new(name="UVMap")
    mesh.uv_layers.active = new_uv
    mesh.uv_layers.active_index = 0

    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0),
        margin_method="FRACTION",
        island_margin=0.0008,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    try:
        bpy.ops.uv.pack_islands(
            rotate=True,
            scale=True,
            margin_method="FRACTION",
            margin=0.0008,
        )
    except Exception as exc:
        print("  pack_islands note:", exc)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = False

    for poly in mesh.polygons:
        poly.use_smooth = True

    bpy.ops.wm.save_as_mainfile(filepath=str(low_prepped_path), compress=True)
    meta = {
        "asset": asset_key,
        "raw_vertices": raw_verts,
        "raw_triangles": raw_tris,
        "low_vertices": low_verts,
        "low_triangles": low_tris,
    }
    (SCRATCH / f"{asset_key}_prep_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"  Saved prepped low-poly: {low_prepped_path.name}")

def setup_cycles_gpu(scene):
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
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = False
    scene.render.bake.margin_type = "ADJACENT_FACES"
    return gpu_backend

def look_at(obj, target):
    direction = target - obj.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    obj.rotation_euler = rot_quat.to_euler()

def save_arr_png(arr_flat, size, name, colorspace, path):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(arr_flat)
    img.update()
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

def downscale_half(arr_flat, res_hi, res_lo, is_normal=False):
    arr_hi = arr_flat.reshape(res_hi, res_hi, 4)
    factor = res_hi // res_lo
    arr_lo = arr_hi.reshape(res_lo, factor, res_lo, factor, 4).mean(axis=(1, 3))
    if is_normal:
        n = arr_lo[:, :, :3] * 2.0 - 1.0
        lengths = np.linalg.norm(n, axis=-1, keepdims=True)
        valid = lengths > 0.1
        n = np.where(valid, n / np.maximum(lengths, 1e-6), np.array([0.0, 0.0, 1.0], dtype=np.float32))
        arr_lo[:, :, :3] = np.clip(n * 0.5 + 0.5, 0.0, 1.0)
    arr_lo[:, :, 3] = 1.0
    return arr_lo.astype(np.float32).ravel()

def bake_low_poly(asset_key):
    t0 = time.time()
    spec = ASSET_SPECS[asset_key]
    raw_blend = spec["raw_blend"]
    res_hi = spec["bake_res"]
    res_lo = spec["export_res"]
    low_prepped_path = SCRATCH / f"{asset_key}_low_unwrapped.blend"
    prep_meta = json.loads((SCRATCH / f"{asset_key}_prep_meta.json").read_text())

    print(f"\n[BAKE] Opening prepped low-poly '{asset_key}'...")
    bpy.ops.wm.open_mainfile(filepath=str(low_prepped_path))
    scene = bpy.context.scene
    gpu_backend = setup_cycles_gpu(scene)

    low_obj = bpy.data.objects["Mesh_0"]
    low_obj.name = f"{asset_key}_Low"
    low_mesh = low_obj.data
    low_mesh.name = f"{asset_key}_LowMesh"

    uv_coords = np.empty(len(low_mesh.loops) * 2, dtype=np.float32)
    low_mesh.uv_layers.active.data.foreach_get("uv", uv_coords)
    uv_coords = uv_coords.reshape(-1, 2)
    unique_uvs = int(len(np.unique(np.round(uv_coords, 4), axis=0)))

    print(f"  Appending high-poly Mesh_0 from {raw_blend.name}...")
    with bpy.data.libraries.load(str(raw_blend), link=False) as (data_from, data_to):
        data_to.objects = ["Mesh_0"]
    high_obj = data_to.objects[0]
    high_obj.name = f"{asset_key}_High"
    bpy.context.collection.objects.link(high_obj)
    high_mesh = high_obj.data
    high_mat = high_mesh.materials[0]
    high_mat.name = "HighPolyMat"

    apply_canonical_equipment_transform(high_mesh, asset_key)

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

    def run_bake_suite(tag, extrusion, max_ray, margin_px):
        scene.render.bake.cage_extrusion = extrusion
        scene.render.bake.max_ray_distance = max_ray
        scene.render.bake.margin = margin_px

        for l in list(hp_links):
            if l.to_node == hp_bsdf and l.to_socket.name in ("Metallic", "Normal"):
                hp_links.remove(l)
        hp_bsdf.inputs["Metallic"].default_value = 0.0
        hp_links.new(hp_bsdf.outputs["BSDF"], hp_out.inputs["Surface"])

        img_c = bpy.data.images.new(f"c_{tag}", width=res_hi, height=res_hi, alpha=False, float_buffer=False)
        img_c.colorspace_settings.name = "sRGB"
        select_high_to_low(img_c)
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE")
        arr_c = np.empty(res_hi * res_hi * 4, dtype=np.float32)
        img_c.pixels.foreach_get(arr_c)
        bpy.data.images.remove(img_c)

        hp_links.new(hp_norm_map.outputs["Normal"], hp_bsdf.inputs["Normal"])

        img_n = bpy.data.images.new(f"n_{tag}", width=res_hi, height=res_hi, alpha=False, float_buffer=False)
        img_n.colorspace_settings.name = "Non-Color"
        select_high_to_low(img_n)
        scene.render.bake.normal_space = "TANGENT"
        scene.render.bake.normal_r = "POS_X"
        scene.render.bake.normal_g = "POS_Y"
        scene.render.bake.normal_b = "POS_Z"
        bpy.ops.object.bake(type="NORMAL")
        arr_n = np.empty(res_hi * res_hi * 4, dtype=np.float32)
        img_n.pixels.foreach_get(arr_n)
        bpy.data.images.remove(img_n)

        img_r = bpy.data.images.new(f"r_{tag}", width=res_hi, height=res_hi, alpha=False, float_buffer=True)
        img_r.colorspace_settings.name = "Non-Color"
        hp_links.new(hp_sep.outputs["Green"], hp_emit.inputs["Color"])
        hp_links.new(hp_emit.outputs["Emission"], hp_out.inputs["Surface"])
        select_high_to_low(img_r)
        bpy.ops.object.bake(type="EMIT")
        arr_r = np.empty(res_hi * res_hi * 4, dtype=np.float32)
        img_r.pixels.foreach_get(arr_r)
        bpy.data.images.remove(img_r)

        img_m = bpy.data.images.new(f"m_{tag}", width=res_hi, height=res_hi, alpha=False, float_buffer=True)
        img_m.colorspace_settings.name = "Non-Color"
        hp_links.new(hp_sep.outputs["Blue"], hp_emit.inputs["Color"])
        hp_links.new(hp_emit.outputs["Emission"], hp_out.inputs["Surface"])
        select_high_to_low(img_m)
        bpy.ops.object.bake(type="EMIT")
        arr_m = np.empty(res_hi * res_hi * 4, dtype=np.float32)
        img_m.pixels.foreach_get(arr_m)
        bpy.data.images.remove(img_m)

        hp_links.new(hp_sep.outputs["Blue"], hp_bsdf.inputs["Metallic"])
        hp_links.new(hp_norm_map.outputs["Normal"], hp_bsdf.inputs["Normal"])
        hp_links.new(hp_bsdf.outputs["BSDF"], hp_out.inputs["Surface"])

        return (
            arr_c.reshape(res_hi, res_hi, 4),
            arr_n.reshape(res_hi, res_hi, 4),
            arr_r.reshape(res_hi, res_hi, 4)[:, :, 0],
            arr_m.reshape(res_hi, res_hi, 4)[:, :, 0],
        )

    print(f"  Baking {res_hi}x{res_hi} maps on {gpu_backend}...")
    c_tight, n_tight, r_tight, m_tight = run_bake_suite("tight", spec["tight_extrusion"], spec["tight_max_ray"], 4)
    c_wide, n_wide, r_wide, m_wide = run_bake_suite("wide", spec["wide_extrusion"], spec["wide_max_ray"], 8)

    hit_tight = (np.max(c_tight[:, :, :3], axis=-1) > 0.002) | (r_tight > 0.01) | (m_tight > 0.01)
    hit_wide = (np.max(c_wide[:, :, :3], axis=-1) > 0.002) | (r_wide > 0.01) | (m_wide > 0.01)
    valid_tight = hit_tight & (n_tight[:, :, 2] > 0.50)
    valid_wide = hit_wide & (n_wide[:, :, 2] > 0.48)
    use_tight = valid_tight
    use_wide = (~use_tight) & valid_wide
    mask = (use_tight | use_wide).copy()

    c_merged = np.where(use_tight[:, :, None], c_tight, np.where(use_wide[:, :, None], c_wide, 0.0))
    c_merged[:, :, 3] = 1.0
    default_norm = np.array([0.5, 0.5, 1.0, 1.0], dtype=np.float32)
    n_merged = np.where(use_tight[:, :, None], n_tight, np.where(use_wide[:, :, None], n_wide, default_norm))
    r_merged = np.where(use_tight, r_tight, np.where(use_wide, r_wide, 0.0))
    m_merged = np.where(use_tight, m_tight, np.where(use_wide, m_wide, 0.0))

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
    mr_merged = np.ones((res_hi, res_hi, 4), dtype=np.float32)
    mr_merged[:, :, 0] = 1.0
    mr_merged[:, :, 1] = np.clip(r_merged, 0.0, 1.0)
    mr_merged[:, :, 2] = np.clip(m_merged, 0.0, 1.0)
    mr_merged[:, :, 3] = 1.0

    c_hi_flat = c_merged.astype(np.float32).ravel()
    n_hi_flat = n_merged.astype(np.float32).ravel()
    mr_hi_flat = mr_merged.astype(np.float32).ravel()

    path_c_lo = SCRATCH / f"{asset_key}_basecolor_{res_lo}.png"
    path_n_lo = SCRATCH / f"{asset_key}_normal_{res_lo}.png"
    path_mr_lo = SCRATCH / f"{asset_key}_mr_{res_lo}.png"
    save_arr_png(downscale_half(c_hi_flat, res_hi, res_lo, False), res_lo, "c_lo", "sRGB", path_c_lo)
    save_arr_png(downscale_half(mr_hi_flat, res_hi, res_lo, False), res_lo, "mr_lo", "Non-Color", path_mr_lo)
    save_arr_png(downscale_half(n_hi_flat, res_hi, res_lo, True), res_lo, "n_lo", "Non-Color", path_n_lo)

    # Remove high-poly object, mesh, material, and images immediately
    bpy.data.objects.remove(high_obj, do_unlink=True)
    bpy.data.meshes.remove(high_mesh)
    bpy.data.materials.remove(high_mat)
    for img in list(bpy.data.images):
        if img.name not in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    low_obj.name = "Mesh_0"
    low_mesh.name = "Mesh_0"

    img_c = bpy.data.images.load(str(path_c_lo))
    img_c.name = "Image_0"
    img_c.colorspace_settings.name = "sRGB"
    img_c.pack()

    img_mr = bpy.data.images.load(str(path_mr_lo))
    img_mr.name = "Image_1"
    img_mr.colorspace_settings.name = "Non-Color"
    img_mr.pack()

    img_n = bpy.data.images.load(str(path_n_lo))
    img_n.name = "Image_2"
    img_n.colorspace_settings.name = "Non-Color"
    img_n.pack()

    low_nodes.clear()
    out_node = low_nodes.new("ShaderNodeOutputMaterial")
    bsdf_node = low_nodes.new("ShaderNodeBsdfPrincipled")
    tex_color = low_nodes.new("ShaderNodeTexImage")
    tex_color.image = img_c
    tex_mr = low_nodes.new("ShaderNodeTexImage")
    tex_mr.image = img_mr
    sep_mr = low_nodes.new("ShaderNodeSeparateColor")
    tex_norm = low_nodes.new("ShaderNodeTexImage")
    tex_norm.image = img_n
    norm_map = low_nodes.new("ShaderNodeNormalMap")

    low_links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])
    low_links.new(tex_color.outputs["Color"], bsdf_node.inputs["Base Color"])
    low_links.new(tex_mr.outputs["Color"], sep_mr.inputs["Color"])
    low_links.new(sep_mr.outputs["Green"], bsdf_node.inputs["Roughness"])
    low_links.new(sep_mr.outputs["Blue"], bsdf_node.inputs["Metallic"])
    low_links.new(tex_norm.outputs["Color"], norm_map.inputs["Color"])
    low_links.new(norm_map.outputs["Normal"], bsdf_node.inputs["Normal"])

    # Special splitting for Beam Saber: separate saberHilt and saberBlade (with emissive violet material!)
    if asset_key == "saber":
        verts = [v.co.copy() for v in low_mesh.vertices]
        faces = [list(f.vertices) for f in low_mesh.polygons]
        uvs = [[tuple(low_mesh.uv_layers.active.data[i].uv) for i in f.loop_indices] for f in low_mesh.polygons]
        normals = [[tuple(low_mesh.corner_normals[i].vector) for i in f.loop_indices] for f in low_mesh.polygons]

        hilt_fids = []
        blade_fids = []
        for fi, f in enumerate(faces):
            cy = sum(verts[v].y for v in f) / len(f)
            if cy >= -0.207:
                hilt_fids.append(fi)
            else:
                blade_fids.append(fi)

        blade_mat = low_mat.copy()
        blade_mat.name = "SaberBladeMaterial"
        b_bsdf = next(n for n in blade_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b_bsdf.inputs["Emission Color"].default_value = (0.76, 0.24, 1.0, 1.0)
        b_bsdf.inputs["Emission Strength"].default_value = 2.8
        b_bsdf.inputs["Roughness"].default_value = 0.14

        root_empty = bpy.data.objects.new("equipBeamSaber", None)
        bpy.context.collection.objects.link(root_empty)

        def build_submesh(sub_name, fids, mat):
            used = sorted({v for fi in fids for v in faces[fi]})
            mapping = {v: j for j, v in enumerate(used)}
            mdata = bpy.data.meshes.new(sub_name + "Mesh")
            mdata.from_pydata([verts[v] for v in used], [], [[mapping[v] for v in faces[fi]] for fi in fids])
            mdata.update()
            mdata.materials.append(mat)
            uv_layer = mdata.uv_layers.new(name="UVMap")
            loop_normals = []
            for poly, fi in zip(mdata.polygons, fids):
                for li, co in zip(poly.loop_indices, uvs[fi]):
                    uv_layer.data[li].uv = co
                poly.use_smooth = True
                loop_normals.extend(normals[fi])
            mdata.normals_split_custom_set(loop_normals)
            sub_ob = bpy.data.objects.new(sub_name, mdata)
            bpy.context.collection.objects.link(sub_ob)
            sub_ob.parent = root_empty
            return sub_ob

        build_submesh("saberHilt", hilt_fids, low_mat)
        build_submesh("saberBlade", blade_fids, blade_mat)
        bpy.data.objects.remove(low_obj, do_unlink=True)
        bpy.data.meshes.remove(low_mesh)
        print(f"  Split saber into saberHilt ({len(hilt_fids)} tris) and saberBlade ({len(blade_fids)} tris)")

    if spec["out_blend"]:
        bpy.ops.wm.save_as_mainfile(filepath=str(spec["out_blend"]), compress=True)
        out_size = spec["out_blend"].stat().st_size
        print(f"  Saved {spec['out_blend'].name}: {out_size / (1024*1024):.2f} MiB")
    if spec["out_glb"]:
        bpy.ops.export_scene.gltf(
            filepath=str(spec["out_glb"]),
            export_format="GLB",
            export_yup=True,
            export_animations=False,
        )
        out_size = spec["out_glb"].stat().st_size
        print(f"  Exported {spec['out_glb'].name}: {out_size / (1024*1024):.2f} MiB")

    if spec.get("thumb"):
        world = bpy.data.worlds.new("ThumbWorld")
        scene.world = world
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.10, 0.13, 0.17, 1.0)
            bg.inputs[1].default_value = 1.3

        def add_sun(name, energy, rot_deg):
            ld = bpy.data.lights.new(name=name, type="SUN")
            ld.energy = energy
            lo = bpy.data.objects.new(name=name, object_data=ld)
            bpy.context.collection.objects.link(lo)
            lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)
            return lo

        add_sun("TKey", 3.8, (48, 0, 35))
        add_sun("TFill", 2.0, (65, 0, -45))
        add_sun("TBack", 2.4, (-45, 0, 175))

        cam_data = bpy.data.cameras.new("ThumbCam")
        cam_data.lens = 50
        cam_obj = bpy.data.objects.new("ThumbCam", cam_data)
        bpy.context.collection.objects.link(cam_obj)
        scene.camera = cam_obj

        scene.cycles.samples = 16
        scene.render.resolution_x = 256
        scene.render.resolution_y = 256
        scene.render.image_settings.file_format = "PNG"

        if asset_key == "saber":
            target = Vector((0.0, -0.55, 0.0))
            cam_obj.location = Vector((1.45, 0.75, 0.65))
        elif asset_key == "rifle":
            target = Vector((0.0, -0.35, 0.15))
            cam_obj.location = Vector((1.75, -0.95, 0.45))
        elif asset_key == "shield":
            target = Vector((0.0, 0.0, 0.0))
            cam_obj.location = Vector((2.35, -0.95, 0.25))
        look_at(cam_obj, target)
        scene.render.filepath = str(spec["thumb"])
        bpy.ops.render.render(write_still=True)
        print(f"  Rendered thumbnail: {spec['thumb'].name}")

    summary = {
        **prep_meta,
        "unique_uvs": unique_uvs,
        "covered_texel_fraction": round(float(np.mean(mask)), 4),
        "out_blend_bytes": spec["out_blend"].stat().st_size if spec["out_blend"] else None,
        "out_glb_bytes": spec["out_glb"].stat().st_size if spec["out_glb"] else None,
        "elapsed_seconds": round(time.time() - t0, 2),
    }
    (SCRATCH / f"{asset_key}_bake_meta.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

targets = ["sentinel", "saber", "shield", "rifle"] if args.asset == "all" else [args.asset]
for k in targets:
    if args.stage == "prep":
        prep_low_poly(k)
    else:
        bake_low_poly(k)
