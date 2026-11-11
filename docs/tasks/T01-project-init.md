# T01 · Initialize the project

**Goal:** a project skeleton everyone develops on; four people share one set of dependency versions.

## To do
- At the repo root, create the project with Vite's `vanilla-ts` template (do not create a nested subfolder); install `three` and `@types/three`
- TypeScript strict mode; `npm run build` = type check + build
- `vite.config.ts`: `base: './'` (so it works under a GitHub Pages subpath), `server.host: true` (so devices on the LAN can access it)
- Create the empty directories and placeholder files following the `src/` layout in `docs/ARCHITECTURE.md` §3 (a single comment line describing the responsibility is enough)
- `index.html`: a 3D viewport area on the left + a control panel on the right
- Commit `package-lock.json`
- Update `.gitignore` (node_modules, dist)

## Not in scope
Scene content, models, UI features.

## Acceptance criteria
- [ ] After `npm install && npm run dev` the page opens with no console errors
- [ ] `npm run build` succeeds
- [ ] Directory structure matches ARCHITECTURE.md
