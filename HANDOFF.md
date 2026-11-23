# Alchemists Ledger — Sprint 1 Handoff

## 1. Features Completed & Verified
- **Gate 0**: Authored `ARCHITECTURE.md`, `SPEC.md`, `.gitignore`, Vite (`base: './'`) + TypeScript config, and 9 model-agnostic `.agents/agents/*.md` manifests (`inherit`/`pro`/`flash`).
- **Gate 1**:
  - `shaders/{cauldron_core,glass_caustics,stained_glass_weather}.glsl` + `src/render/`: WebGL2 Navier-Stokes Suminagashi marbling, vorticity confinement, Jacobi pressure projection, glass caustics, wax relief, stained-glass skies, and Canvas2D fallback.
  - `src/alchemy/` & `src/cellar/`: 12-reagent density/viscosity/pH/enthalpy/shear engine and cubic Bezier cellar polyrhythms (`3:4`, `4:5`, `5:6`).
  - `src/audio/`: Zero-sample Web Audio API foley (mortar, slice, pipette, ladle, modal glass, cork pop, wax, brass scale, quill, cellar harmonics, rain/ember ambience, Karplus-Strong lute).
- **Gate 2**:
  - `simulation/`: Weather shock elasticity, 8 NPC envoys with tells, damped brass balance-scale physics, solvency, and zero raw buy/sell arbitrage.
  - `src/vault/`: IndexedDB (`alchemists_ledger_idb`), LocalStorage (`alchemists_ledger_primary_v1`), CRC32 `krunked-cookie-vault-v1` (`<= 3900` bytes) bidirectional auto-healing, 3 Wax-Seal slots, Daily Reset, `.ledger.json` sync.
  - Live-Ops & PWA: `scripts/sync_festivals.py` (`public/data/festivals.json`), `192x192` & `512x512` raster PNGs (`89 50 4E 47`), subpath `public/manifest.json`, network-first `public/sw.js` (`alchemists-ledger-v1`), `.github/workflows/{festival_sync,deploy-pages}.yml`.
- **Gate 3 & Gate 4**:
  - Zero-HUD 5-station workbench (`index.html`, `src/main.ts`, `src/ui/`, `src/styles/`) with wet-ink ledger and `beforeinstallprompt`.
  - `npm test`: `58/58` tests across 5 suites pass (`tsc --noEmit` + `vite build` clean).
  - `node tests/pwa_binary_verify.mjs`: `14/14` checks pass (`0.92 MiB` footprint).
  - Live Chrome QA (`/alchemists_ledger/`): `0` console/page/404 errors, `144.01 FPS` (`6.94 ms` avg delta on WebGL2 GPU), full 5-station shift, and `krunked-cookie-vault-v1` bidirectional healing after `localStorage` + `indexedDB` wipe and cookie purge.

## 2. Active Technical Debt or Known Edge Cases
- Software WebGL2 (SwiftShader) measures `9.09 FPS` when all 3 station canvases draw every frame; hardware GPU hits `144.01 FPS`. Skipping hidden station canvases in `renderFrame` is an easy win.
- `krunked-cookie-vault-v1` fallback caps digest storage to top 6 shelf bottles and 6 cellar nodes per slot; full history lives in IndexedDB/LocalStorage and `.ledger.json`.

## 3. Environment / Dependency Shifts
- Zero runtime npm deps. DevDeps: TypeScript `5.7.2`, Vite `6.4.6`, Vitest `2.1.9`, `jsdom`, `@types/node`.
- Windows uses `python scripts/sync_festivals.py`; Ubuntu CI uses `python3`.

## 4. Next Immediate Sprint Priorities
1. Skip `ApothecaryRenderer.renderFrame` draw passes for `display: none` inactive station canvases.
2. Verify deployed GitHub Pages WebAPK installability at `https://krunked-fpv.github.io/alchemists_ledger/`.
3. Expand seasonal festival commission variety and optional stereo room reverb.
