"""Reduce the dither noise that the AI generator baked into the GLB textures.

Usage:  python3 scripts/clean_textures.py public/assets/models/gundam-rigged.glb [more.glb ...]

What it does (in place, geometry / UVs / skin weights untouched):
  * base color: edge-preserving (bilateral) smoothing, removes the halftone-like
    dot pattern while keeping panel lines and color borders
  * normal map: bilateral smoothing, then re-normalized to unit length
  * metallic-roughness: light median filter
It cannot repaint content the generator got wrong (smears, dark blotches).
Requires: pip install opencv-python-headless numpy
"""
import json, struct, sys
import cv2, numpy as np


def read_glb(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), bytearray(b[20 + n + 8:])


def write_glb(path, j, binbuf):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binbuf += b"\0" * (-len(binbuf) % 4)
    total = 12 + 8 + len(js) + 8 + len(binbuf)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
        f.write(struct.pack("<I4s", len(binbuf), b"BIN\0")); f.write(binbuf)


def clean(path):
    j, binbuf = read_glb(path)
    mat = j["materials"][0]
    pbr = mat.get("pbrMetallicRoughness", {})
    role = {}
    def src(t): return j["textures"][t["index"]]["source"]
    if "baseColorTexture" in pbr: role[src(pbr["baseColorTexture"])] = "color"
    if "normalTexture" in mat: role[src(mat["normalTexture"])] = "normal"
    if "metallicRoughnessTexture" in pbr: role[src(pbr["metallicRoughnessTexture"])] = "mr"

    # Rebuild the binary buffer view by view so sizes can change.
    views = j["bufferViews"]
    image_view = {im["bufferView"]: i for i, im in enumerate(j["images"]) if "bufferView" in im}
    out = bytearray()
    for vi, bv in enumerate(views):
        data = bytes(binbuf[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]])
        if vi in image_view and image_view[vi] in role:
            kind = role[image_view[vi]]
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if kind == "color":
                img = cv2.bilateralFilter(img, 7, 28, 3)
                img = cv2.bilateralFilter(img, 7, 28, 3)
                ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95]); mime = "image/jpeg"
            elif kind == "normal":
                img = cv2.bilateralFilter(img, 9, 40, 4)
                v = img.astype(np.float32) / 127.5 - 1.0
                v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
                img = np.clip((v + 1.0) * 127.5, 0, 255).astype(np.uint8)
                ok, enc = cv2.imencode(".png", img); mime = "image/png"
            else:
                img = cv2.medianBlur(img, 5)
                ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92]); mime = "image/jpeg"
            data = enc.tobytes()
            j["images"][image_view[vi]]["mimeType"] = mime
            print(f"  {kind}: cleaned ({len(data) // 1024} KB)")
        out += b"\0" * (-len(out) % 4)
        bv["byteOffset"] = len(out); bv["byteLength"] = len(data)
        out += data
    j["buffers"][0]["byteLength"] = len(out) + (-len(out) % 4)
    write_glb(path, j, out)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p); clean(p)
