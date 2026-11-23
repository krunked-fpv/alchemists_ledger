# Alchemists Ledger — Sprint 2 Handoff

## 1. Features Completed & Verified
- **Transitions & Micro-Juice (`src/ui/studio_app.ts`, `src/styles/studio.css`, `src/audio/index.ts`)**: Directional GPU-composited station glides (`left`/`right`/`cellar-down`/`cellar-up`) with brass specular sweeps, wrought-iron cellar trapdoor veil, tactile mortar/knife/pipette/bellows/3-beat seal animations, and `station_transition` Web Audio synthesis.
- **Ceremonial Celebration Juice (`src/ui/celebration_fx.ts`, `src/render/index.ts`, `src/audio/index.ts`)**: Non-blocking `CelebrationDirector` + `triggerCelebrationBurst` + 5 procedural `celebration_fanfare` kinds (`seal_masterwork` wax shockwave + prism sparks, `bargain_struck` coin cascade to crown pouch, `commission_fulfilled` Wax-Ribbon Guild Charter banner, `dawn_chime` Dawn Omen banner, `cellar_harvest` condenser flare).
- **Non-Repeating Deep Level Pool**:
  - `simulation/market_shocks.ts`: `pickDailyMarketRegime` prevents back-to-back weather repeats.
  - `simulation/npc_envoys.ts`: 64 named envoys (`8` archetypes x `8` names) and `32x32` posture/gaze tells with 12-visit sliding exclusion.
  - `src/alchemy/reagents.ts`: 72+ non-repeating solvable procedural STEM commissions (`generateProceduralCommissions`) + multi-strata/thermal/pH potion naming; `scripts/sync_festivals.py` expanded to 20 festivals & 60 weekly templates.
- **Multi-Device Playtest & Fixes**: Hidden inactive canvas WebGL2/Canvas2D skip in `src/render/index.ts`; fixed active tab contrast, serif diamond glyphs (`◆`/`❖`), bottom non-overlapping banners/whispers, envoy dialogue reset, 2-line scale pan clamping, cellar node collision spacing & label flip, `>= 46px` touch targets across transitions, and compact mobile rail (`<= 768px`).
- **Verification**: `npm test` `72/72` (`5` suites), `tsc --noEmit && vite build` clean, `node tests/pwa_binary_verify.mjs` `16/16` (`1.11 MiB` footprint), host `/browser` E2E + 5-device Chrome GPU playtest (`1440x900`, `1024x768`, `768x1024`, `412x915`, `375x667`) at `143.99–144.02 FPS`, `0` overflow, `0` sub-`44px` targets, `0` regime repeats, and mobile cookie self-healing verified.

## 2. Active Technical Debt or Known Edge Cases
- Software WebGL2 (SwiftShader) measures `~9.68 FPS` on active Cauldron due to CPU fragment rasterization of 10 Navier-Stokes FBO passes (`144 FPS` on hardware GPU).
- `krunked-cookie-vault-v1` compact fallback caps digest persistence at top 6 bottles/cellar nodes per slot (`IndexedDB`/`LocalStorage`/`.ledger.json` remain full).

## 3. Environment / Dependency Shifts
- Zero runtime npm deps; DevDeps unchanged (`typescript`, `vite`, `vitest`, `jsdom`, `@types/node`).
- Windows runs `python scripts/sync_festivals.py`; Ubuntu CI runs `python3`.

## 4. Next Immediate Sprint Priorities
1. Smoke-test live GitHub Pages URL `https://krunked-fpv.github.io/alchemists_ledger/` and WebAPK install prompt on physical mobile hardware.
2. Add optional SwiftShader/low-power FBO resolution auto-tier (`128` vs `256` on software renderers).
3. Add customizable household seal colors/titles inside Wax Vault drawer.
