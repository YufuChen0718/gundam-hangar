# T12 · Vision Pro testing and adaptation

**Goal:** complete the full demo flow on Vision Pro (windowed experience).

## To do
1. Open the GitHub Pages demo in Vision Pro **Safari**; record visionOS/Safari versions in `docs/progress.md`
2. Test: page display, pinch-to-click buttons, model rotation/zoom (do not rely on scroll wheel/right click), frame rate
3. Adapt: make buttons larger, ensure every operation has an explicit button (rotate / zoom / reset), adjust layout for the window size
4. Measure performance with the T11 tools; separate browser frame time from headset refresh rate
5. Record a screen capture for the videos

## Aspirational (only after the core is stable)
- visionOS app shell: WKWebView loads the deployed page
- WebXR immersive mode: the mecha appears in 3D space, spatial menu, pinch to rotate

## Acceptance criteria
- [ ] The full demo flow works on Vision Pro without any mouse-only operations
- [ ] Performance data and limitations are recorded
