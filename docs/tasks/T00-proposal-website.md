# T00 · Publish the proposal webpage (due Nov 10, 11:59 PM)

**Goal:** a publicly accessible proposal webpage, saved as a PDF from Safari and submitted on Gradescope.

## To do
- Write `website/index.html` (plain HTML + CSS is fine). Content per the course requirements:
  title + 2–3 sentence summary + four team members / Problem Description / Goals and Deliverables (baseline + aspirational, demo flow, evaluation methods, research questions) / Schedule (weekly) / Resources
- Content is based on the existing proposal draft, revised to the **desktop-first, Vision Pro (windowed) second** route (see `docs/PLAN.md` §1)
- Safari opens the page → **File → Print → Save as PDF** (not Export as PDF) → check page breaks → upload to Gradescope

## Tonight's quick option
1. Write `website/index.html`, push to main
2. Pages: Source = *GitHub Actions*, using the official "Static HTML" workflow template with the upload path changed to `website` (T10 later replaces it with the full workflow that also builds the demo)
3. URL: `https://yufuchen0718.github.io/mecha-hangar/`

## Acceptance criteria
- [ ] The URL opens on a phone/computer, and every link on the page is clickable
- [ ] Team member names have no placeholders left
- [ ] The PDF contains a clickable website link and uses normal page size
