# T11 · Evaluation tools

**Goal:** produce the data and charts the report needs (see PLAN §7).

## To do (`src/debug/diagnostics.ts` + Debug tab)
- **Frame time:** rolling window, median / p95 (ms) and FPS, plus draw calls / triangle count
- **Joint angle recording:** start/stop, record selected joints' angle from the bind pose each frame (time, action, mode, angle) → download CSV
- **Attachment error:** recompute the expected world matrix with an explicit matrix product, compare with the scene-graph result → position error (m), angle error (°)
- **Performance comparison switches:** shadows on/off, model detail (if T09 provides several LODs)
- Store data in `docs/results/`; write a small Python/notebook script to plot (cut vs blend curves, frame-time box plots)

## Acceptance criteria
- [ ] The CSV opens in a spreadsheet, and the cut vs blend plot clearly shows the difference
- [ ] Attachment error is close to 0 across several poses (otherwise it is a bug)
- [ ] Performance numbers are reproducible in a fixed scene (two runs within 10% of each other)
