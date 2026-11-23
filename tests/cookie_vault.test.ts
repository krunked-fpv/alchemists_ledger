// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_REAGENT_ORDER,
  COOKIE_MAX_BYTES,
  COOKIE_VAULT_NAME,
  IDB_NAME,
  IDB_STORE,
  PRIMARY_LS_KEY,
  VaultManager,
  computeCrc32Hex,
  createDefaultLedgerState,
  createDefaultSlotState,
  decodeCookieVaultDigest,
  encodeCookieVaultDigest,
  type CraftedPotion,
  type HouseholdSlotId,
  type LedgerSaveStateV1,
  type ReagentId,
} from '../src/vault/index';

interface MockIdbBackend {
  factory: IDBFactory;
  clearAll: () => void;
  hasStoreRecord: () => boolean;
  corruptRecord: (value: unknown) => void;
}

function createInMemoryIdb(): MockIdbBackend {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();

  const schedule = (fn: () => void): void => {
    queueMicrotask(fn);
  };

  const factory = {
    open(name: string) {
      const req: Record<string, unknown> = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      schedule(() => {
        let stores = databases.get(name);
        const isUpgrade = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }

        const objectStoreNames = {
          contains: (storeName: string) => stores!.has(storeName),
        };

        const db = {
          objectStoreNames,
          onversionchange: null as null | (() => void),
          close: () => {},
          createObjectStore: (storeName: string) => {
            if (!stores!.has(storeName)) {
              stores!.set(storeName, new Map());
            }
            return {};
          },
          transaction: (storeName: string) => {
            const tx: Record<string, unknown> = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: (requestedStore: string) => {
                const targetName = requestedStore || storeName;
                const map = stores!.get(targetName);
                if (!map) {
                  throw new Error(`Missing object store ${targetName}`);
                }
                return {
                  get: (key: IDBValidKey) => {
                    const getReq: Record<string, unknown> = {
                      result: undefined,
                      onsuccess: null,
                      onerror: null,
                    };
                    schedule(() => {
                      getReq.result = map.get(key);
                      if (typeof getReq.onsuccess === 'function') {
                        (getReq.onsuccess as () => void)();
                      }
                      if (typeof tx.oncomplete === 'function') {
                        (tx.oncomplete as () => void)();
                      }
                    });
                    return getReq;
                  },
                  put: (val: unknown, key: IDBValidKey) => {
                    const putReq: Record<string, unknown> = {
                      result: key,
                      onsuccess: null,
                      onerror: null,
                    };
                    schedule(() => {
                      map.set(key, structuredClone(val));
                      if (typeof putReq.onsuccess === 'function') {
                        (putReq.onsuccess as () => void)();
                      }
                      if (typeof tx.oncomplete === 'function') {
                        (tx.oncomplete as () => void)();
                      }
                    });
                    return putReq;
                  },
                };
              },
            };
            return tx;
          },
        };

        req.result = db;
        if (isUpgrade && typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as () => void)();
        }
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as () => void)();
        }
      });

      return req as unknown as IDBOpenDBRequest;
    },
    deleteDatabase(name: string) {
      const req: Record<string, unknown> = {
        onsuccess: null,
        onerror: null,
      };
      schedule(() => {
        databases.delete(name);
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as () => void)();
        }
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    clearAll: () => {
      databases.clear();
    },
    hasStoreRecord: () => {
      const db = databases.get(IDB_NAME);
      const store = db?.get(IDB_STORE);
      return Boolean(store && store.has(PRIMARY_LS_KEY));
    },
    corruptRecord: (value: unknown) => {
      let db = databases.get(IDB_NAME);
      if (!db) {
        db = new Map();
        databases.set(IDB_NAME, db);
      }
      let store = db.get(IDB_STORE);
      if (!store) {
        store = new Map();
        db.set(IDB_STORE, store);
      }
      store.set(PRIMARY_LS_KEY, value);
    },
  };
}

function makeSamplePotion(idx: number, day: number): CraftedPotion {
  const vessels = ['prism', 'teardrop', 'crescent', 'carafe'] as const;
  const colors = ['crimson', 'verdigris', 'gold', 'indigo'] as const;
  const crests = ['phoenix', 'alembic', 'crescent', 'scales'] as const;
  const effects = [
    'fire_ward',
    'burn_salve',
    'hearth_tonic',
    'galaxy_elixir',
    'neutralizing_salve',
    'soothing_draught',
  ] as const;

  return {
    id: `potion-${idx}`,
    name: `Masterwork Tonic #${idx}`,
    vessel: vessels[idx % vessels.length],
    seal: {
      color: colors[idx % colors.length],
      crest: crests[(idx + 1) % crests.length],
      stamped: idx % 2 === 0,
    },
    layers: [
      {
        reagentId: CANONICAL_REAGENT_ORDER[idx % 12],
        prepForm: 'ground_crystal',
        specificGravity: 1.48,
        volumeMl: 30,
        viscosity: 4.2,
        colorRgb: [0.85, 0.4, 0.2],
        micaIntensity: 0.4,
        interfaceSharpness: 0.92,
      },
      {
        reagentId: CANONICAL_REAGENT_ORDER[(idx + 5) % 12],
        prepForm: 'pipette_drops',
        specificGravity: 0.88,
        volumeMl: 20,
        viscosity: 1.9,
        colorRgb: [0.46, 0.32, 0.88],
        micaIntensity: 0.75,
        interfaceSharpness: 0.9,
      },
    ],
    purity: 0.94,
    marblingIndex: 0.14,
    layerCrispness: 0.86,
    collectorBrilliance: 0.91,
    ph: 6.8,
    peakTempC: 88,
    dominantEffect: effects[idx % effects.length],
    baseValueCrowns: 74.5 + idx * 5,
    createdAtDay: day,
  };
}

function clearVaultCookies(): void {
  document.cookie = `${COOKIE_VAULT_NAME}=; path=/; max-age=0`;
}

describe('Shadow-Cookie Vault & Tri-Store Self-Healing', () => {
  const originalIdb = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    clearVaultCookies();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    clearVaultCookies();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIdb,
      configurable: true,
      writable: true,
    });
  });

  it('exposes frozen spec constants, canonical 12-reagent order, and IEEE 802.3 CRC32', () => {
    expect(COOKIE_VAULT_NAME).toBe('krunked-cookie-vault-v1');
    expect(PRIMARY_LS_KEY).toBe('alchemists_ledger_primary_v1');
    expect(IDB_NAME).toBe('alchemists_ledger_idb');
    expect(IDB_STORE).toBe('ledger_slots_v1');
    expect(COOKIE_MAX_BYTES).toBe(3900);
    expect(CANONICAL_REAGENT_ORDER).toHaveLength(12);
    expect(CANONICAL_REAGENT_ORDER[0]).toBe('amber_honey_resin');
    expect(CANONICAL_REAGENT_ORDER[11]).toBe('starlight_aether_oil');

    expect(computeCrc32Hex('123456789')).toBe('cbf43926');
    expect(computeCrc32Hex('')).toBe('00000000');
  });

  it('rejects CRC32 tampering, malformed prefixes, corrupt payloads, and out-of-bounds digests', () => {
    const state = createDefaultLedgerState('2026-11-23');
    state.slots[1].crowns = 412.5;
    state.slots[1].shelfPotions.push(makeSamplePotion(0, 1));

    const encoded = encodeCookieVaultDigest(state);
    expect(encoded.startsWith('v1.')).toBe(true);
    const parts = encoded.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[1]).toMatch(/^[0-9a-f]{8}$/);
    expect(parts[1]).toBe(computeCrc32Hex(parts[2]));

    // Valid round-trip
    const decoded = decodeCookieVaultDigest(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.slots[1].crowns).toBe(412.5);
    expect(decoded?.slots[1].shelfPotions).toHaveLength(1);
    expect(decoded?.slots[1].shelfPotions[0].seal.stamped).toBe(true);

    // Tamper 1 char in payload
    const badChar = parts[2][0] === 'A' ? 'B' : 'A';
    expect(decodeCookieVaultDigest(`v1.${parts[1]}.${badChar}${parts[2].slice(1)}`)).toBeNull();

    // Tamper 1 char in CRC hex
    const badHex = parts[1][0] === '0' ? '1' : '0';
    expect(decodeCookieVaultDigest(`v1.${badHex}${parts[1].slice(1)}.${parts[2]}`)).toBeNull();

    // Wrong version prefix / missing segments / garbage / oversized
    expect(decodeCookieVaultDigest(`v2.${parts[1]}.${parts[2]}`)).toBeNull();
    expect(decodeCookieVaultDigest('v1.abcd')).toBeNull();
    expect(decodeCookieVaultDigest('')).toBeNull();
    expect(decodeCookieVaultDigest('v1.00000000.!!!')).toBeNull();

    // Valid CRC32 over schema-invalid JSON must still be rejected by bounds checks
    const forgedB64 = Buffer.from(JSON.stringify({ v: 1, active: 9, slots: [] }), 'utf8')
      .toString('base64url');
    const forged = `v1.${computeCrc32Hex(forgedB64)}.${forgedB64}`;
    expect(decodeCookieVaultDigest(forged)).toBeNull();
  });

  it('keeps encodeCookieVaultDigest strictly <= 3900 bytes under maxed 3-slot state and trims gracefully', () => {
    const state = createDefaultLedgerState('2026-11-23');
    state.activeSlot = 2;

    for (const slotId of [1, 2, 3] as HouseholdSlotId[]) {
      const slot = state.slots[slotId];
      slot.label = `Overlong Household Sanctuary Banner Name #${slotId}`;
      slot.mode = 'grandmaster';
      slot.day = 420 + slotId;
      slot.crowns = 99999.5;
      slot.reputation = 8750;
      slot.regime = 'starfall_conclave';
      slot.unlockedVessels = ['prism', 'teardrop', 'crescent', 'carafe'];

      for (const id of CANONICAL_REAGENT_ORDER) {
        slot.reagentStock[id] = 999;
        slot.cellarGraph.quintessences[id] = 88;
        slot.cellarGraph.catalystSalts[id] = 77;
      }

      // Add 14 potions (> 6) with 6 layers each to force graceful oldest trimming
      for (let p = 0; p < 14; p++) {
        const potion = makeSamplePotion(p, slot.day);
        while (potion.layers.length < 6) {
          potion.layers.push({ ...potion.layers[0], volumeMl: 15 });
        }
        slot.shelfPotions.push(potion);
      }

      // Add 10 cellar nodes (> 6) and edges
      for (let n = 0; n < 10; n++) {
        const appTypes = [
          'boiling_retort',
          'graham_condenser',
          'copper_siphon',
          'drip_alembic',
        ] as const;
        slot.cellarGraph.nodes.push({
          id: `node-${n}`,
          type: appTypes[n % appTypes.length],
          x: (n + 1) / 11,
          y: 0.25 + (n % 3) * 0.2,
          inputReagent: CANONICAL_REAGENT_ORDER[n % 12],
          active: true,
          cyclePhase: 0.5,
        });
        if (n > 0) {
          slot.cellarGraph.edges.push({
            id: `edge-${n}`,
            fromNodeId: `node-${n - 1}`,
            toNodeId: `node-${n}`,
            ratio: n % 2 === 0 ? '4:5' : '5:6',
            dropletProgress: 0.3,
          });
        }
      }

      for (let c = 0; c < 15; c++) {
        slot.completedCommissionIds.push(`2026-W48-grandmaster-festival-commission-entry-${c}`);
      }
      for (let l = 0; l < 40; l++) {
        slot.ledgerEntries.push({
          id: `log-${l}`,
          day: l + 1,
          timestampIso: '2026-11-23T12:00:00.000Z',
          text: `Extensive verbose wet-ink ledger entry #${l} documenting sale to wandering court envoy`,
          deltaCrowns: 45,
          kind: 'sale',
        });
      }
    }

    const digest = encodeCookieVaultDigest(state);
    const byteLen = new TextEncoder().encode(digest).length;
    expect(byteLen).toBeLessThanOrEqual(COOKIE_MAX_BYTES);
    expect(COOKIE_VAULT_NAME.length + 1 + byteLen).toBeLessThanOrEqual(COOKIE_MAX_BYTES);

    const decoded = decodeCookieVaultDigest(digest);
    expect(decoded).not.toBeNull();
    expect(decoded?.activeSlot).toBe(2);
    for (const slotId of [1, 2, 3] as HouseholdSlotId[]) {
      const s = decoded!.slots[slotId];
      expect(s.crowns).toBe(99999.5);
      expect(s.day).toBe(420 + slotId);
      expect(s.mode).toBe('grandmaster');
      expect(s.regime).toBe('starfall_conclave');
      expect(s.reagentStock.amber_honey_resin).toBe(999);
      expect(s.reagentStock.starlight_aether_oil).toBe(999);
      expect(s.shelfPotions.length).toBeLessThanOrEqual(6);
      expect(s.shelfPotions.length).toBeGreaterThan(0);
      // Oldest potions trimmed, top newest bottles preserved
      expect(s.shelfPotions[s.shelfPotions.length - 1].baseValueCrowns).toBe(74.5 + 13 * 5);
      expect(s.cellarGraph.nodes.length).toBe(6);
      expect(s.cellarGraph.quintessences.amber_honey_resin).toBe(88);
      expect(s.cellarGraph.catalystSalts.starlight_aether_oil).toBe(77);
    }
  });

  it('heals from krunked-cookie-vault-v1 and repopulates BOTH localStorage and indexedDB after deletion', async () => {
    const idb = createInMemoryIdb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: idb.factory,
      configurable: true,
      writable: true,
    });

    const vault = new VaultManager();
    const state = createDefaultLedgerState('2026-11-23');
    state.activeSlot = 3;
    state.slots[3].mode = 'grandmaster';
    state.slots[3].day = 12;
    state.slots[3].crowns = 654.5;
    state.slots[3].reagentStock.cinnabar_sulfur_ash = 19;
    state.slots[3].shelfPotions.push(makeSamplePotion(2, 12));
    state.slots[3].cellarGraph.nodes.push({
      id: 'c1',
      type: 'graham_condenser',
      x: 0.4,
      y: 0.6,
      inputReagent: 'verdigris_moss_sap',
      active: true,
      cyclePhase: 0,
    });
    state.slots[3].cellarGraph.quintessences.verdigris_moss_sap = 4;

    const { cookieBytes } = await vault.save(state);
    expect(cookieBytes).toBeGreaterThan(20);
    expect(cookieBytes).toBeLessThanOrEqual(COOKIE_MAX_BYTES);
    expect(localStorage.getItem(PRIMARY_LS_KEY)).not.toBeNull();
    expect(idb.hasStoreRecord()).toBe(true);
    expect(document.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);

    // Wipe BOTH primary stores while preserving krunked-cookie-vault-v1
    localStorage.clear();
    idb.clearAll();
    expect(localStorage.getItem(PRIMARY_LS_KEY)).toBeNull();
    expect(idb.hasStoreRecord()).toBe(false);

    const booted = await vault.boot();
    expect(booted.healedFrom).toBe('cookie');
    expect(booted.state.activeSlot).toBe(3);
    expect(booted.state.slots[3].mode).toBe('grandmaster');
    expect(booted.state.slots[3].day).toBe(12);
    expect(booted.state.slots[3].crowns).toBe(654.5);
    expect(booted.state.slots[3].reagentStock.cinnabar_sulfur_ash).toBe(19);
    expect(booted.state.slots[3].shelfPotions).toHaveLength(1);
    expect(booted.state.slots[3].cellarGraph.quintessences.verdigris_moss_sap).toBe(4);

    // Verify BOTH primary stores were repopulated automatically
    const restoredLsRaw = localStorage.getItem(PRIMARY_LS_KEY);
    expect(restoredLsRaw).not.toBeNull();
    expect(JSON.parse(restoredLsRaw!).slots[3].crowns).toBe(654.5);
    expect(idb.hasStoreRecord()).toBe(true);

    // Subsequent audit sees healthy synced tri-store
    const postAudit = await vault.auditAndHeal();
    expect(postAudit.healed).toBe(false);
    expect(postAudit.source).toBe('primary');
  });

  it('regenerates krunked-cookie-vault-v1 on cookie deletion via both auditAndHeal() and boot()', async () => {
    const idb = createInMemoryIdb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: idb.factory,
      configurable: true,
      writable: true,
    });

    const cookieJar = { cookie: '' };
    const vault = new VaultManager({ cookieTarget: cookieJar });
    const state = createDefaultLedgerState('2026-11-23');
    state.slots[1].crowns = 333;
    await vault.save(state);

    expect(cookieJar.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);
    expect(cookieJar.cookie).toContain('path=/; max-age=31536000; SameSite=Lax');

    // Delete cookie -> auditAndHeal regenerates it
    cookieJar.cookie = '';
    const audit = await vault.auditAndHeal();
    expect(audit.healed).toBe(true);
    expect(audit.source).toBe('primary');
    expect(cookieJar.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);
    expect(cookieJar.cookie).toContain('path=/; max-age=31536000; SameSite=Lax');

    // Delete cookie AND corrupt localStorage -> boot heals from IDB and regenerates cookie + LS
    cookieJar.cookie = `${COOKIE_VAULT_NAME}=v1.deadbeef.corrupted`;
    localStorage.setItem(PRIMARY_LS_KEY, '{corrupt-json');
    const booted = await vault.boot();
    expect(booted.healedFrom).toBe('idb');
    expect(booted.state.slots[1].crowns).toBe(333);
    expect(cookieJar.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);
    expect(decodeCookieVaultDigest(cookieJar.cookie.split(';')[0].split('=')[1])?.slots[1].crowns).toBe(333);

    // Corrupt cookie only -> boot regenerates valid cookie from primary
    cookieJar.cookie = `${COOKIE_VAULT_NAME}=v1.00000000.tampered`;
    const bootHealCookie = await vault.boot();
    expect(bootHealCookie.healedFrom).toBe('primary');
    const healedRaw = cookieJar.cookie.split(';')[0].split('=')[1];
    expect(decodeCookieVaultDigest(healedRaw)?.slots[1].crowns).toBe(333);
  });

  it('handles fresh boot and empty auditAndHeal gracefully', async () => {
    const vault = new VaultManager({ useIdb: false });

    const emptyAudit = await vault.auditAndHeal();
    expect(emptyAudit.healed).toBe(false);
    expect(emptyAudit.source).toBe('none');
    expect(emptyAudit.state).toBeUndefined();

    const freshBoot = await vault.boot('2026-11-23');
    expect(freshBoot.healedFrom).toBe('fresh');
    expect(freshBoot.state.activeSlot).toBe(1);
    expect(freshBoot.state.slots[1].dateSeed).toBe('2026-11-23');
    expect(freshBoot.state.slots[2].slotId).toBe(2);
    expect(freshBoot.state.slots[3].slotId).toBe(3);
  });

  it('maintains 3 independent household slots across switchHouseholdSlot and cookie healing', async () => {
    const vault = new VaultManager({ useIdb: false });
    let state = createDefaultLedgerState('2026-11-23');

    state.slots[1] = createDefaultSlotState(1, 'apprentice', '2026-11-23');
    state.slots[1].crowns = 250;
    state.slots[1].reagentStock.amber_honey_resin = 17;

    state = await vault.switchHouseholdSlot(state, 2);
    state.slots[2].mode = 'grandmaster';
    state.slots[2].crowns = 890.5;
    state.slots[2].day = 9;
    state.slots[2].reagentStock.starlight_aether_oil = 14;
    state.slots[2].shelfPotions.push(makeSamplePotion(1, 9));

    state = await vault.switchHouseholdSlot(state, 3);
    state.slots[3].crowns = 42;
    state.slots[3].day = 3;
    state.slots[3].completedCommissionIds.push('2026-W48-apprentice');
    await vault.save(state);

    // Simulate LS eviction to confirm all 3 independent slots heal intact from cookie
    localStorage.clear();
    const healed = await vault.boot();
    expect(healed.healedFrom).toBe('cookie');
    expect(healed.state.activeSlot).toBe(3);

    expect(healed.state.slots[1].mode).toBe('apprentice');
    expect(healed.state.slots[1].crowns).toBe(250);
    expect(healed.state.slots[1].reagentStock.amber_honey_resin).toBe(17);

    expect(healed.state.slots[2].mode).toBe('grandmaster');
    expect(healed.state.slots[2].crowns).toBe(890.5);
    expect(healed.state.slots[2].day).toBe(9);
    expect(healed.state.slots[2].reagentStock.starlight_aether_oil).toBe(14);
    expect(healed.state.slots[2].shelfPotions).toHaveLength(1);

    expect(healed.state.slots[3].crowns).toBe(42);
    expect(healed.state.slots[3].day).toBe(3);
    expect(healed.state.slots[3].completedCommissionIds).toContain('2026-W48-apprentice');
  });

  it('performs deterministic YYYY-MM-DD New Dawn Reset and is idempotent per dateSeed', async () => {
    const vault = new VaultManager({ useIdb: false });
    const baseA = createDefaultLedgerState('2026-11-23');
    const baseB = createDefaultLedgerState('2026-11-23');

    const resetA = await vault.triggerNewDawnReset(baseA, '2026-11-24');
    const resetB = await vault.triggerNewDawnReset(baseB, '2026-11-24');

    expect(resetA).toEqual(resetB);
    expect(baseA.slots[1].day).toBe(1); // Does not mutate input
    expect(resetA.slots[1].day).toBe(2);
    expect(resetA.slots[1].dateSeed).toBe('2026-11-24');
    expect(resetA.slots[1].ledgerEntries.at(-1)?.kind).toBe('reset');
    // Inactive slots remain untouched
    expect(resetA.slots[2].day).toBe(1);
    expect(resetA.slots[2].dateSeed).toBe('2026-11-23');

    // Calling again with same YYYY-MM-DD is deterministic and idempotent
    const repeatSameDay = await vault.triggerNewDawnReset(resetA, '2026-11-24');
    expect(repeatSameDay.slots[1].day).toBe(2);
    expect(repeatSameDay.slots[1].regime).toBe(resetA.slots[1].regime);

    // Next day advances cleanly
    const day3 = await vault.triggerNewDawnReset(repeatSameDay, '2026-11-25');
    expect(day3.slots[1].day).toBe(3);
    expect(day3.slots[1].dateSeed).toBe('2026-11-25');

    await expect(vault.triggerNewDawnReset(day3, 'not-a-date')).rejects.toThrow();
  });

  it('exports and imports .ledger.json cleanly and rejects corrupt JSON without throwing', () => {
    const vault = new VaultManager({ useIdb: false });
    const state = createDefaultLedgerState('2026-11-23');
    state.audioMuted = true;
    state.audioVolume = 0.42;
    state.slots[1].crowns = 515.5;
    state.slots[1].shelfPotions.push(makeSamplePotion(0, 1));
    state.slots[1].ledgerEntries.push({
      id: 'sale-1',
      day: 1,
      timestampIso: '2026-11-23T09:15:00.000Z',
      text: 'Sold Fire Ward Prism to Singed Warden',
      deltaCrowns: 75,
      kind: 'sale',
    });

    const exported = vault.exportLedgerJson(state);
    const imported = vault.importLedgerJson(exported);
    expect(imported).toEqual(state);

    // Malformed / corrupt / hostile JSON cases must return null safely
    const corruptInputs = [
      '',
      '   ',
      '{not valid json',
      'null',
      '[]',
      '"hello"',
      JSON.stringify({ schemaVersion: 2 }),
      JSON.stringify({ ...state, activeSlot: 4 }),
      JSON.stringify({ ...state, audioVolume: 2.5 }),
      JSON.stringify({ ...state, slots: { 1: state.slots[1] } }),
      JSON.stringify({
        ...state,
        slots: {
          ...state.slots,
          1: { ...state.slots[1], crowns: -10 },
        },
      }),
      JSON.stringify({
        ...state,
        slots: {
          ...state.slots,
          1: { ...state.slots[1], dateSeed: '2026-99-99' },
        },
      }),
      JSON.stringify({
        ...state,
        slots: {
          ...state.slots,
          2: {
            ...state.slots[2],
            reagentStock: {
              ...state.slots[2].reagentStock,
              ['amber_honey_resin' as ReagentId]: -1,
            },
          },
        },
      }),
      '{"schemaVersion":1,"__proto__":{"polluted":true}}',
    ];

    for (const bad of corruptInputs) {
      expect(() => vault.importLedgerJson(bad)).not.toThrow();
      expect(vault.importLedgerJson(bad)).toBeNull();
    }
  });

  it('repairs corrupt localStorage + corrupt indexedDB record from cookie and decodes minimal SPEC digests & Unicode bloat', async () => {
    const idb = createInMemoryIdb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: idb.factory,
      configurable: true,
      writable: true,
    });

    const vault = new VaultManager();
    const state = createDefaultLedgerState('2026-11-23');
    state.slots[1].label = 'Élan Sanctuary ★';
    state.slots[1].crowns = 777;
    await vault.save(state);

    // Corrupt BOTH primary stores simultaneously
    localStorage.setItem(PRIMARY_LS_KEY, JSON.stringify({ schemaVersion: 1, broken: true }));
    idb.corruptRecord({ schemaVersion: 1, activeSlot: 99 });

    const booted = await vault.boot();
    expect(booted.healedFrom).toBe('cookie');
    expect(booted.state.slots[1].crowns).toBe(777);
    expect(booted.state.slots[1].label).toBe('Élan Sanctuary ★');

    // Verify both primary stores were healed back to valid schema
    const lsRepaired = vault.importLedgerJson(localStorage.getItem(PRIMARY_LS_KEY) ?? '');
    expect(lsRepaired?.slots[1].crowns).toBe(777);
    const secondAudit = await vault.auditAndHeal();
    expect(secondAudit.healed).toBe(false);
    expect(secondAudit.source).toBe('primary');

    // Minimal SPEC-only CookieVaultDigestV1 (no optional fields) decodes cleanly
    const minimalSpecDigest = {
      v: 1,
      active: 2,
      slots: [1, 2, 3].map((s) => ({
        s,
        m: s === 2 ? 1 : 0,
        d: 5,
        ds: '2026-11-23',
        c: 201,
        r: 15,
        rg: 1,
        uv: 3,
        stk: new Array(12).fill(7),
        pot: [[0, 17, 0, 90, 85, 140]],
        cel: [
          [0, 1, 0],
          [1, 5, 2],
        ],
        qnt: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        cmp: 5,
      })),
    };
    const minB64 = Buffer.from(JSON.stringify(minimalSpecDigest), 'utf8').toString('base64url');
    const minPacket = `v1.${computeCrc32Hex(minB64)}.${minB64}`;
    const decodedMin = decodeCookieVaultDigest(minPacket);
    expect(decodedMin).not.toBeNull();
    expect(decodedMin?.activeSlot).toBe(2);
    expect(decodedMin?.slots[2].crowns).toBe(100.5);
    expect(decodedMin?.slots[2].cellarGraph.edges).toHaveLength(1);
    expect(decodedMin?.slots[2].completedCommissionIds.length).toBe(2);

    // Extreme bloat across all 3 slots stays <= 3900 bytes
    const bloated = createDefaultLedgerState('2026-11-23');
    for (const s of [1, 2, 3] as HouseholdSlotId[]) {
      bloated.slots[s].crowns = 12345.5;
      bloated.slots[s].day = 999;
      bloated.slots[s].label = '日本語・Αλχημία・VeryLongName1234567890';
      for (let i = 0; i < 60; i++) {
        bloated.slots[s].shelfPotions.push(makeSamplePotion(i, 999));
      }
      for (let i = 0; i < 40; i++) {
        bloated.slots[s].completedCommissionIds.push(`very-long-unicode-commission-★-${i}-end`);
      }
    }
    const bloatedPacket = encodeCookieVaultDigest(bloated);
    expect(new TextEncoder().encode(bloatedPacket).length).toBeLessThanOrEqual(COOKIE_MAX_BYTES);
    const decodedBloated = decodeCookieVaultDigest(bloatedPacket);
    expect(decodedBloated?.slots[1].crowns).toBe(12345.5);
    expect(decodedBloated?.slots[3].day).toBe(999);
  });
});
