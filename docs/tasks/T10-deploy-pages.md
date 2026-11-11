# T10 · Auto-deploy website and demo

**Goal:** every push to main automatically updates the website (proposal/milestone/final) and the online demo.

## To do
- `.github/workflows/pages.yml`: checkout → setup-node 22 → `npm ci` → `npm run build` → assemble `_site/` (`website/*` at the root, `dist/*` under `demo/`) → upload-pages-artifact → deploy-pages
- Repo Settings → Pages → Source = GitHub Actions
- Add a link to the demo on the website pages

## Acceptance criteria
- [ ] `https://yufuchen0718.github.io/mecha-hangar/` shows the website
- [ ] `https://yufuchen0718.github.io/mecha-hangar/demo/` runs the demo (no 404 on resources)
- [ ] The site updates automatically within about 2 minutes of a push
