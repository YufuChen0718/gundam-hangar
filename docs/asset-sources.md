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
| `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` (225 MB local source, git-ignored due to GitHub's 100 MB file limit) | Meshy AI (user-provided local file at `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend`) | User-generated via Meshy AI | Decimated from 2,002,991 to ~30,000 triangles and downscaled textures from 8K/4K to 2K in `assets-src/gundam-guardian-source.blend` (< 50 MB); rigged with 15-joint skeleton, 17 connected-component-cleaned parts, shared boundary weights, and cleaned textures in `public/assets/models/gundam-guardian.glb` | Team |
| `assets-src/mecha-original.blend` | Meshy AI (`Meshy_AI_Gundam_Sentinel_in_the_Hangar_20260704_texture.blend`) | User-generated via Meshy AI | 15-joint full-body rig and 17-part segmentation in `assets-src/gundam-rigged.blend` and `public/assets/models/gundam-rigged.glb` | Team |

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
