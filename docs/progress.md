# Progress Log

Newest entries on top. One short entry per work session: what changed, what broke, what's next.
These notes feed directly into the milestone and final reports.

---

## 2026-11-10 · Project setup (Yufu)
- Created the repo; contents are planning only: PLAN, ARCHITECTURE, WORKFLOW, AGENTS.md, task cards T00–T12.
- Decided route: **desktop first, Vision Pro (windowed, via Safari) second**; immersive WebXR / visionOS app are aspirational.
- Implementation will be done task by task (team members + dsh / Antigravity).
- **Next:** T00 proposal webpage (due tonight 11:59 PM) → T01 project init.

## 2026-11-10 · T00 Proposal Webpage
- Created `website/index.html` and `website/style.css` with the revised desktop-first, Vision Pro Safari (windowed) baseline proposal and `@media print` rules for clean Safari PDF export.
- Populated all four team member names (Yufu Chen, Zihan Wang, Junxiang You, Dongyang Dai) and added clickable top-level links to the live GitHub Pages site and GitHub repository.
- Added `.github/workflows/pages.yml` to automatically deploy `website/` to GitHub Pages on push to `main` or manual dispatch.
- **Known issues:** None. Ready to push to `main` and export PDF via Safari `File → Print → Save as PDF`.
