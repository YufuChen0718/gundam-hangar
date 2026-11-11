# T08 · Shared state / commands + desktop panel

**Goal:** the complete desktop interaction flow, built in a way the Vision Pro UI can reuse later.

## To do
- `src/app/state.ts`: `HangarState` + a minimal Store (`get / update / subscribe`)
- `src/app/commands.ts`: the 8 commands listed in ARCHITECTURE §4; each one = change the model + update the Store
  - `playAction('swing')` equips the sword automatically, `playAction('aim')` equips the rifle automatically
- `src/ui/desktopPanel.ts`: tabs Appearance / Equipment / Animation (Debug comes later in T11)
  - buttons only call commands; the highlight state is refreshed by subscribing to the Store
  - every operation has a button (no hover-only or scroll-only operations, so it is easy to use on Vision Pro)
  - the layout adapts to the window width (the panel moves below on narrow screens)
- Initialization also goes through commands (do not set the initial state separately)

## Acceptance criteria
- [ ] Full demo flow: change colors → equip sword → swing → switch to rifle → aim, with no glitches throughout
- [ ] `grep` shows no direct calls from `ui/` to rig / equipment / animator
- [ ] When an animation switches action by itself (swing → idle), the button highlight updates too
