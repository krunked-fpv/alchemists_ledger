import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_REPO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AGENT_MODELS = new Set(['inherit', 'pro', 'flash']);

const CANONICAL_REAGENTS = [
  'amber_honey_resin',
  'cinnabar_sulfur_ash',
  'bismuth_vitriol_salt',
  'glacial_alum_shard',
  'chalk_pearl_lime',
  'verdigris_moss_sap',
  'saffron_hearth_pollen',
  'cobalt_lotus_nectar',
  'moonveil_lichen_dew',
  'rose_madder_distillate',
  'auric_mica_suspension',
  'starlight_aether_oil',
];

const CANONICAL_ENVOYS = [
  'singed_warden',
  'guild_loupe_connoisseur',
  'rain_soaked_herbalist',
  'frostbitten_courier',
  'starfall_astronomer',
  'iron_miner_factor',
  'court_chirurgeon',
  'wandering_bard_peddler',
];

const failures = [];
const passes = [];

function recordPass(label) {
  passes.push(label);
}

function recordFail(label, reason) {
  failures.push(`${label}: ${reason}`);
}

function resolveRoot(...segments) {
  return path.join(ROOT_DIR, ...segments);
}

function verifyPngBinary(relPath, expectedWidth, expectedHeight) {
  const absPath = resolveRoot(relPath);
  if (!fs.existsSync(absPath)) {
    recordFail(relPath, 'missing PNG file');
    return;
  }

  const buf = fs.readFileSync(absPath);
  if (buf.length < 24) {
    recordFail(relPath, `truncated PNG (${buf.length} bytes < 24)`);
    return;
  }

  const headText = buf.subarray(0, Math.min(256, buf.length)).toString('utf8').trimStart().toLowerCase();
  if (
    headText.startsWith('<svg') ||
    headText.startsWith('<?xml') ||
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.startsWith('<')
  ) {
    recordFail(relPath, 'text/SVG/HTML payload masquerading as PNG binary');
    return;
  }

  const magic = buf.subarray(0, 8);
  if (!magic.equals(PNG_MAGIC)) {
    recordFail(
      relPath,
      `invalid PNG magic header ${magic.toString('hex')} (expected ${PNG_MAGIC.toString('hex')})`
    );
    return;
  }

  const ihdrLen = buf.readUInt32BE(8);
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR' || ihdrLen !== 13) {
    recordFail(relPath, `invalid IHDR chunk type=${ihdrType} len=${ihdrLen}`);
    return;
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    recordFail(relPath, `unexpected dimensions ${width}x${height} (expected ${expectedWidth}x${expectedHeight})`);
    return;
  }

  const hasIend = buf.includes(Buffer.from('IEND', 'ascii'));
  if (!hasIend) {
    recordFail(relPath, 'missing PNG IEND trailer chunk');
    return;
  }

  recordPass(`${relPath} (${width}x${height}, ${buf.length} bytes, valid PNG IHDR)`);
}

function verifyManifest(relPath) {
  const absPath = resolveRoot(relPath);
  if (!fs.existsSync(absPath)) {
    recordFail(relPath, 'missing manifest.json');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    recordFail(relPath, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const errs = [];
  if (manifest.display !== 'standalone') errs.push(`display=${String(manifest.display)}`);
  if (manifest.start_url !== './') errs.push(`start_url=${String(manifest.start_url)}`);
  if (manifest.scope !== './') errs.push(`scope=${String(manifest.scope)}`);
  if (manifest.background_color !== '#16100c') {
    errs.push(`background_color=${String(manifest.background_color)}`);
  }
  if (manifest.theme_color !== '#16100c') {
    errs.push(`theme_color=${String(manifest.theme_color)}`);
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errs.push('icons must be a non-empty array');
  } else {
    for (let i = 0; i < manifest.icons.length; i++) {
      const icon = manifest.icons[i];
      if (!icon || typeof icon.src !== 'string' || !icon.src.startsWith('./icons/')) {
        errs.push(`icons[${i}].src=${String(icon?.src)} must start with ./icons/`);
      }
    }
  }

  if (errs.length > 0) {
    recordFail(relPath, errs.join('; '));
  } else {
    recordPass(`${relPath} (standalone PWA metadata & relative ./icons/ paths)`);
  }
}

function verifyServiceWorker(relPath) {
  const absPath = resolveRoot(relPath);
  if (!fs.existsSync(absPath)) {
    recordFail(relPath, 'missing sw.js');
    return;
  }

  const src = fs.readFileSync(absPath, 'utf8');
  const errs = [];
  if (!src.includes("'alchemists-ledger-v1'") && !src.includes('"alchemists-ledger-v1"')) {
    errs.push("missing cache key 'alchemists-ledger-v1'");
  }
  if (!/addEventListener\s*\(\s*['"]install['"]\s*,/.test(src)) {
    errs.push("missing 'install' listener");
  }
  if (!/addEventListener\s*\(\s*['"]activate['"]\s*,/.test(src)) {
    errs.push("missing 'activate' listener");
  }
  if (!/addEventListener\s*\(\s*['"]fetch['"]\s*,/.test(src)) {
    errs.push("missing 'fetch' listener");
  }
  if (!/\brespondWith\s*\(/.test(src)) {
    errs.push('fetch listener has no active event.respondWith(...) handler');
  }

  if (errs.length > 0) {
    recordFail(relPath, errs.join('; '));
  } else {
    recordPass(`${relPath} (cache 'alchemists-ledger-v1', install/activate/fetch active)`);
  }
}

function verifyHtmlEntry(relPath) {
  const absPath = resolveRoot(relPath);
  if (!fs.existsSync(absPath)) {
    recordFail(relPath, 'missing HTML file');
    return;
  }

  const html = fs.readFileSync(absPath, 'utf8');
  const errs = [];
  if (!html.includes('./manifest.json')) {
    errs.push('missing ./manifest.json reference');
  }
  if (!html.includes('./icons/icon-192.png')) {
    errs.push('missing ./icons/icon-192.png reference');
  }
  if (!html.includes('./sw.js')) {
    errs.push('missing ./sw.js registration');
  }

  const rootAbsMatches = html.match(/\b(?:src|href)\s*=\s*(?:["']\/[^"']*["']|\/[^\s>]*)/gi);
  if (rootAbsMatches && rootAbsMatches.length > 0) {
    errs.push(`found root-absolute references: ${rootAbsMatches.join(', ')}`);
  }

  if (errs.length > 0) {
    recordFail(relPath, errs.join('; '));
  } else {
    recordPass(`${relPath} (relative ./ assets & zero root-absolute refs)`);
  }
}

function verifyFestivalsJson(relPath) {
  const absPath = resolveRoot(relPath);
  if (!fs.existsSync(absPath)) {
    recordFail(relPath, 'missing festivals.json');
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    recordFail(relPath, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const errs = [];
  if (data.schemaVersion !== 1) {
    errs.push(`schemaVersion=${String(data.schemaVersion)} (expected 1)`);
  }

  const mods = data.reagentElasticityModifiers;
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) {
    errs.push('missing reagentElasticityModifiers object');
  } else {
    const keys = Object.keys(mods);
    if (keys.length !== 12) {
      errs.push(`expected 12 reagent modifiers, found ${keys.length}`);
    }
    for (const reagent of CANONICAL_REAGENTS) {
      const val = mods[reagent];
      if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
        errs.push(`invalid modifier for ${reagent}: ${String(val)}`);
      }
    }
  }

  const weights = data.envoyBiasWeights;
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    errs.push('missing envoyBiasWeights object');
  } else {
    const keys = Object.keys(weights);
    if (keys.length !== 8) {
      errs.push(`expected 8 envoy bias weights, found ${keys.length}`);
    }
    for (const envoy of CANONICAL_ENVOYS) {
      const val = weights[envoy];
      if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
        errs.push(`invalid envoy weight for ${envoy}: ${String(val)}`);
      }
    }
  }

  if (!Array.isArray(data.commissions) || data.commissions.length !== 3) {
    errs.push(`expected 3 commissions, found ${Array.isArray(data.commissions) ? data.commissions.length : 'non-array'}`);
  }

  if (errs.length > 0) {
    recordFail(relPath, errs.join('; '));
  } else {
    recordPass(`${relPath} (schemaVersion=1, 12 reagent modifiers, 8 envoy weights, 3 commissions)`);
  }
}

function measureRepoFootprintBytes(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      total += measureRepoFootprintBytes(fullPath);
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}

function verifyRepoFootprint() {
  const totalBytes = measureRepoFootprintBytes(ROOT_DIR);
  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  if (totalBytes >= MAX_REPO_BYTES) {
    recordFail('repo-footprint', `${totalBytes} bytes (${mb} MiB) exceeds limit ${MAX_REPO_BYTES} bytes (25 MiB)`);
  } else {
    recordPass(`repo-footprint (${totalBytes} bytes / ${mb} MiB < 25 MiB)`);
  }
}

function verifyAgentModels() {
  const agentsDir = resolveRoot('.agents', 'agents');
  if (!fs.existsSync(agentsDir)) {
    recordFail('.agents/agents', 'directory missing');
    return;
  }

  const mdFiles = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

  if (mdFiles.length === 0) {
    recordFail('.agents/agents', 'no agent markdown manifests found');
    return;
  }

  const errs = [];
  for (const fileName of mdFiles) {
    const content = fs.readFileSync(path.join(agentsDir, fileName), 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      errs.push(`${fileName}: missing YAML frontmatter`);
      continue;
    }
    const modelLines = fmMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^model\s*:/.test(line));
    if (modelLines.length !== 1) {
      errs.push(`${fileName}: expected exactly 1 model field, found ${modelLines.length}`);
      continue;
    }
    const modelValue = modelLines[0].replace(/^model\s*:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
    if (!ALLOWED_AGENT_MODELS.has(modelValue)) {
      errs.push(`${fileName}: disallowed model '${modelValue}' (allowed: inherit, pro, flash)`);
    }
  }

  if (errs.length > 0) {
    recordFail('.agents/agents/*.md', errs.join('; '));
  } else {
    recordPass(`.agents/agents/*.md (${mdFiles.length} manifests strictly inherit/pro/flash)`);
  }
}

function main() {
  verifyPngBinary('public/icons/icon-192.png', 192, 192);
  verifyPngBinary('public/icons/icon-512.png', 512, 512);
  verifyManifest('public/manifest.json');
  verifyServiceWorker('public/sw.js');
  verifyHtmlEntry('index.html');
  verifyFestivalsJson('public/data/festivals.json');

  const distDir = resolveRoot('dist');
  if (fs.existsSync(distDir)) {
    verifyPngBinary('dist/icons/icon-192.png', 192, 192);
    verifyPngBinary('dist/icons/icon-512.png', 512, 512);
    verifyManifest('dist/manifest.json');
    verifyServiceWorker('dist/sw.js');
    verifyHtmlEntry('dist/index.html');
    verifyFestivalsJson('dist/data/festivals.json');
  }

  verifyRepoFootprint();
  verifyAgentModels();

  console.log(`[pwa_binary_verify] Passed checks (${passes.length}):`);
  for (const item of passes) {
    console.log(`  PASS: ${item}`);
  }

  if (failures.length > 0) {
    console.error(`[pwa_binary_verify] FAILED checks (${failures.length}):`);
    for (const err of failures) {
      console.error(`  FAIL: ${err}`);
    }
    process.exit(1);
  }

  console.log('[pwa_binary_verify] All PWA, binary icon, festival schema, footprint, and agent hygiene checks passed.');
  process.exit(0);
}

main();
