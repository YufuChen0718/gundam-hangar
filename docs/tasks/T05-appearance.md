# T05 · Region coloring

**Goal:** recolor 4 armor regions independently + 3 presets.

## To do (`src/mecha/appearance.ts`)
- `COLOR_PRESETS`: classic (white/blue/red/dark gray), stealth, desert (choose your own colors, contrast must be clear)
- `applyColors(rig, colors)`: write the color into each region's material
- Note: in the real GLB (T09) several parts may share one material, so `loadMecha` must clone them per region

## Acceptance criteria
- [ ] After changing `primary`, parts of the other three regions keep their color
- [ ] Switching between presets has no leftover colors
