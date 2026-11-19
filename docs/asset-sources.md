# Asset & Code Sources

The course requires us to be explicit about our starting point vs. what we built.
Record **every** external asset, library, tutorial, or code snippet here when it is added.

## Libraries

| Library | Version | Used for | Our own work on top |
|---|---|---|---|
| [three.js](https://threejs.org/) | 0.187.0 | WebGL rendering, scene graph, `Quaternion.slerp`, `GLTFLoader`, `OrbitControls` | Rig abstraction, socket/equipment assembly, keyframe sampling, timing curves, animation state machine & pose blending, shared command/state layer, UI, evaluation tools |
| [Vite](https://vite.dev/) | 8.3.8 | Dev server and bundling | n/a |

## Models / textures

| Asset | Source (URL) | License / terms | Modifications we made | Added by |
|---|---|---|---|---|
| `assets-src/Meshy_AI_Gundam_Sentinel_20261118_texture.blend` (205 MB local source, git-ignored) | Meshy AI (local source file in `assets-src/`) | Meshy-generated, used for a CS184 course project | Decimated from 1,859,487 to 29,999 triangles, unwrapped with a clean non-overlapping Smart UV Project (`66°`), high-to-low baked in Cycles GPU (`Selected to Active`, 4096→2048 Base Color, Tangent-Space Normal, and Emission-baked Metallic/Roughness) in `assets-src/gundam-sentinel-source.blend`, and rigged with 15 joints, 4 sockets, 15 connected-component-cleaned body parts, and shared 2-ring boundary skin weights in `assets-src/gundam-sentinel-rigged.blend` and `public/assets/models/gundam-sentinel.glb` | Team |
| `assets-src/Meshy_AI_Violet_Saber_Glow_20261118_texture.blend` (22 MB local source, git-ignored) | Meshy AI (local source file in `assets-src/`) | Meshy-generated, used for a CS184 course project | Decimated from 54,768 to 4,199 triangles, centered at hilt grip, oriented along socket `+Z`, high-to-low baked in Cycles GPU (`2048→1024`), and split into `saberHilt` + toggleable emissive violet `saberBlade` in `public/assets/models/equip-beam-saber.glb` | Team |
| `assets-src/Meshy_AI_Crimson_Guardian_Shield_20261118_texture.blend` (116 MB local source, git-ignored) | Meshy AI (local source file in `assets-src/`) | Meshy-generated, used for a CS184 course project | Decimated from 977,542 to 6,399 triangles, centered at inner forearm mount, high-to-low baked in Cycles GPU (`4096→2048`), and exported to `public/assets/models/equip-shield.glb` | Team |
| `assets-src/Meshy_AI_Futuristic_Toy_Blaster_20261118_texture.blend` (41 MB local source, git-ignored) | Meshy AI (local source file in `assets-src/`) | Meshy-generated, used for a CS184 course project | Decimated from 260,050 to 6,500 triangles, centered at rear pistol grip with barrel oriented forward (`+Z`), high-to-low baked in Cycles GPU (`4096→2048`), and exported to `public/assets/models/equip-rifle.glb` | Team |
| `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` (225 MB local source, git-ignored) & `assets-src/Meshy_AI_Gundam_Guardian_20261118_part-segmentation_split.stl` (102 MB local STL reference, git-ignored) | Meshy AI (local source files in `assets-src/`, archived in `docs/results/guardian-*`) | Meshy-generated, used for a CS184 course project | Used for high-to-low texture-baking before/after evaluation archived in `docs/results/guardian-bake/` and `docs/results/guardian-*` | Team |
| `assets-src/mecha-original.blend` (Legacy model) | Meshy AI (`Meshy_AI_Gundam_Sentinel_in_the_Hangar_20260704_texture.blend`) | Meshy-generated, used for a CS184 course project | 15-joint full-body rig and 17-part segmentation (`--asset legacy`) in `assets-src/gundam-rigged.blend` and `public/assets/models/gundam-rigged.glb` | Team |

## Code snippets / tutorials referenced

| What | Source | Where used |
|---|---|---|
| | | |


## 2026-11-13 asset and implementation record

- **Source:** user-provided `Meshy_AI_Gundam_Sentinel_in_the_Hangar_20260704_texture.blend`, copied unchanged to `assets-src/mecha-original.blend`; source and backup SHA-256 values are recorded in `docs/results/source-copy-verification.json`.
- **Generation service:** Meshy, as identified by the supplied filename and user. The generation URL and account-specific license terms were not supplied; no license ownership claim is made. Confirm asset publication terms before public distribution.
- **Modifications:** static GLB export; single-arm skeleton; geometric region selection with connected-component cleanup; shared boundary skin weights; preserved UVs and source normals; independent rifle and shield; socket setup.
- **Code:** application and preparation scripts were written for this project. No external complete animation implementation was copied. The application uses Three.js's GLTFLoader, OrbitControls, math and skinning; our keyframe evaluation and control logic do not use AnimationMixer.
- **Additional development tools:** TypeScript, tsx, and Playwright (exact installed versions in package-lock.json).
- **References:** [Three.js documentation](https://threejs.org/docs/), [Vite guide](https://vite.dev/guide/), [Blender Python API](https://docs.blender.org/api/current/).
