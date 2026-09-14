# IZOL L&M: cinematic homepage prototype (Phase 1)

Scrolling moves a camera through the IZOL L&M production (laser cutting of sheet metal) and
out into a finished insulated installation: the sheet bends into pipe cladding, and the
journey continues through a mechanical room to a clad tank.

**Live:** https://pfizolacie-cmd.github.io/izol-lm-cinematic/

- Desktop: WebGL (three.js + React Three Fiber). Reference images are projected onto proxy
  geometry, and the sheet, pipe and tank are real 3D.
- Phones and `prefers-reduced-motion`: a lightweight CSS version with the same content.
- Copy and contact details come from [izollm.sk](https://izollm.sk).

The reference images in `/references` are AI-generated art direction, not photos of the real
workshop.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run plates   # rebuild public/plates from /references (text removal, WebP)
```

URL flags: `?debug` (readout), `?p=0.45` (jump), `?mode=fallback|reduced|webgl`, `?q` (lock full quality).

## Docs

- [STORYBOARD.md](STORYBOARD.md): how every image maps to scroll progress
- [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md): method, test results, known limits

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).
