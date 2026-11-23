# Alchemists Ledger — System Architecture

## 1. Product & Engineering Overview

**Alchemists Ledger** is a zero-backend, subpath-safe Progressive Web Application (PWA) deployed to static GitHub Pages (`https://krunked-fpv.github.io/alchemists_ledger/`). It combines:
1. **Zero-HUD Diegetic Apothecary Studio**: Five tactile spatial stations rendered in sunlit walnut, tarnished brass, oak shelving, candlelit stone, and cotton-rag parchment (`index.html`, `src/ui/**`, `src/styles/**`).
2. **Locked-60fps Multi-Pass Suminagashi Fluid & Caustics Engine**: WebGL2 ping-pong Navier-Stokes + vorticity confinement + specific-gravity buoyancy + chromatic glass caustics + stained-glass weather skies, with an automatic deterministic Canvas2D fallback when hardware WebGL2 float FBOs are unavailable (`shaders/*.glsl`, `src/render/**`).
3. **STEM Reaction Thermodynamics & Kinetic Cellar Glasswork**: 12 botanical/crystalline reagents modeled with real-feel specific gravity, temperature-dependent viscosity, anthocyanin pH indicator curves, exothermic/endothermic enthalpies, and ladle shear-marbling thresholds, paired with an interactive borosilicate cellar condenser/siphon/alembic Bezier graph emitting harmonic polyrhythmic distillation pulses (`src/alchemy/**`, `src/cellar/**`).
4. **Zero-Sample Procedural Web Audio ASMR & Generative Lute**: Pure Web Audio API synthesis (granular mortar crunch, wet slice, modal glass clink, resonant cork pop, wax sizzle, velocity-coupled ladle swirl, brass scale clinks, rain/ember glass ambience, and Karplus-Strong plucked lute) driven through a decoupled typed event bus (`src/audio/**`).
5. **Dynamic Market Roguelike & Brass-Scale Haggling**: Supply/demand cross-elasticity shocks across 5 weather regimes, 8 wandering envoy archetypes with diegetic tells, damped two-pan brass balance-scale torque physics, working-capital solvency, and anti-arbitrage bid/ask spreads (`simulation/*.ts`).
6. **Hardened Zero-Server Vault & Live-Ops PWA**: Tri-store persistence (`IndexedDB` + `LocalStorage` + bidirectional self-healing `krunked-cookie-vault-v1` shadow cookie under 4 KB), 3 household Wax-Seal slots, `.ledger.json` export/import, ISO-week deterministic Python festival generation (`scripts/sync_festivals.py` -> `public/data/festivals.json`), raster PNG WebAPK icons, and network-first service worker (`public/sw.js`).

## 2. Subpath-Safe Static Hosting Topology

All assets, manifests, module imports, data fetches, and Service Worker registrations use **strictly relative `./` paths** (`vite.config.ts` sets `base: './'`). Whether hosted at root `/` or under `/alchemists_ledger/`, zero absolute `/...` references exist.

```
[ Browser Pointer / Multi-Touch ]
        |
        v
[ src/ui/** & src/main.ts ] <---> [ src/vault/index.ts (IDB <-> LS <-> krunked-cookie-vault-v1) ]
   |        |         |         \
   |        |         |          +---> [ simulation/{market_shocks,npc_envoys,haggling_matrix}.ts ]
   |        |         +--------------> [ src/cellar/index.ts ]
   |        +------------------------> [ src/alchemy/index.ts ]
   +---------------------------------> [ src/render/index.ts + shaders/*.glsl ]
   |
   +--- emits AudioPhysicsBusEvent ---> [ src/audio/index.ts (Web Audio + Karplus-Strong) ]
```

## 3. Non-Overlapping Module Ownership Boundaries

To guarantee zero shared-file write collisions across isolated swarm workers:
- **Shaders & Rendering (`kenji-fluid-alchemist`)**: `shaders/cauldron_core.glsl`, `shaders/glass_caustics.glsl`, `shaders/stained_glass_weather.glsl`, `src/render/**`
- **STEM Alchemy & Kinetic Cellar (`nadia-stem-chemist`)**: `src/alchemy/**`, `src/cellar/**`, `tests/alchemy_cellar.test.ts`
- **Procedural Audio ASMR (`elena-acoustic-asmr`)**: `src/audio/**`, `tests/audio_graph.test.ts`
- **Market Economy & Haggling (`marcus-market-economist`)**: `simulation/haggling_matrix.ts`, `simulation/market_shocks.ts`, `simulation/npc_envoys.ts`, `tests/market_simulation.test.ts`
- **Shadow-Cookie Vault & Sync (`devon-vault-archivist`)**: `src/vault/**`, `tests/cookie_vault.test.ts`
- **Live-Ops Python, PWA & CI (`tariq-liveops-pwa`)**: `scripts/sync_festivals.py`, `public/data/festivals.json`, `public/manifest.json`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `.github/workflows/festival_sync.yml`, `.github/workflows/deploy-pages.yml`
- **Zero-HUD Studio UI (`sofia-tactile-artisan`)**: `index.html`, `src/main.ts`, `src/ui/**`, `src/styles/**`
- **Red-Team Crucible & QA (`viktor-redteam-qa`)**: `tests/e2e/**`, `tests/pwa_binary_verify.mjs`

All Gate 1 and Gate 2 subsystems remain structurally typed against `SPEC.md` without cross-domain imports, allowing parallel compilation and unit testing prior to Gate 3 UI integration.

## 4. Persistence & Self-Healing Architecture

1. **Primary Stores**: `IndexedDB` (`alchemists_ledger_idb` / `ledger_slots_v1`) stores full verbose state including wet-ink ledger logs; `LocalStorage` (`alchemists_ledger_primary_v1`) mirrors JSON synchronously for instant cold boot.
2. **Shadow Cookie (`krunked-cookie-vault-v1`)**: Stores a compact `v1.<crc32hex>.<base64url>` payload (`< 3900` bytes, `path=/; max-age=31536000; SameSite=Lax`) holding the active household slot plus quantized progression, crowns, stocks, shelf bottles, cellar topology, and completed commissions across all 3 household slots.
3. **Bidirectional Auto-Healing**:
   - On `boot()` and periodic `auditAndHeal()`: if `LocalStorage` and `IndexedDB` are missing/evicted while `krunked-cookie-vault-v1` has a valid CRC32 digest, full `LedgerSaveStateV1` is deterministically reconstructed and written back to both primary stores.
   - If `krunked-cookie-vault-v1` is absent or stale while primary storage exists, the compact shadow cookie is immediately regenerated.

## 5. Offline-First & Network-First PWA Strategy

- `public/manifest.json` declares `display: "standalone"`, `start_url: "./"`, `scope: "./"`, theme/background `#16100c`, and verified raster PNG icons (`192x192`, `512x512`).
- `public/sw.js` uses `CACHE_VERSION = "alchemists-ledger-v1"`, precaches core static assets on `install`, purges legacy caches on `activate`, and executes a **network-first** `fetch` handler (falling back to cache offline) so weekly `data/festivals.json` updates and new deployments load immediately when online while preserving full offline play.
