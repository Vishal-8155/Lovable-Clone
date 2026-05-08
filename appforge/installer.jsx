// Simulated package installer.
//
// We can't run a real `npm install` from a browser tab, but we DON'T need to:
// the live preview iframe loads packages straight from `esm.sh` via importmap,
// so popular packages (framer-motion, lucide-react, recharts, react-router-dom,
// zustand, axios, clsx, etc.) actually work. This module reproduces the
// terminal feedback loop a developer expects — npm-style logs in the Console
// pane, version resolution, package.json patching — so the UX matches Lovable.
//
// `runInstall({ packages, log, signal, manager })` returns the resolved
// versions so the caller can patch package.json.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Curated reasonable "latest" versions for popular packages so logs feel real.
// Anything not listed falls back to "latest". The exact pinned version is not
// load-bearing because the preview always pulls from esm.sh@latest by default.
const KNOWN_VERSIONS = {
  'framer-motion': '11.5.4',
  'lucide-react': '0.456.0',
  'recharts': '2.13.3',
  'react-router-dom': '6.28.0',
  'react-router': '6.28.0',
  'zustand': '5.0.1',
  'axios': '1.7.7',
  'clsx': '2.1.1',
  'tailwind-merge': '2.5.4',
  'class-variance-authority': '0.7.0',
  'date-fns': '4.1.0',
  'dayjs': '1.11.13',
  'lodash': '4.17.21',
  'lodash-es': '4.17.21',
  '@tanstack/react-query': '5.59.20',
  '@tanstack/react-table': '8.20.5',
  '@radix-ui/react-dialog': '1.1.2',
  '@radix-ui/react-dropdown-menu': '2.1.2',
  '@radix-ui/react-tabs': '1.1.1',
  '@radix-ui/react-tooltip': '1.1.4',
  '@radix-ui/react-slot': '1.1.0',
  'sonner': '1.7.0',
  'zod': '3.23.8',
  'react-hook-form': '7.53.2',
  'uuid': '11.0.3',
  'nanoid': '5.0.8',
  'react-icons': '5.3.0',
  'chart.js': '4.4.6',
  'react-chartjs-2': '5.2.0',
  'three': '0.170.0',
  '@react-three/fiber': '8.17.10',
  '@react-three/drei': '9.117.3',
  'gsap': '3.12.5',
  'react-spring': '9.7.4',
  '@headlessui/react': '2.2.0',
  '@heroicons/react': '2.1.5',
};

function versionFor(pkg) {
  return KNOWN_VERSIONS[pkg] || 'latest';
}

// Realistic per-package resolve+fetch+link timing without making the user wait.
// Total time scales sub-linearly so installs of 6 packages still feel snappy.
function timingFor(i, total) {
  const base = 220 + Math.random() * 280;
  const decay = Math.max(0.45, 1 - i * 0.06);
  return Math.round(base * decay);
}

export async function runInstall({ packages, log, signal, manager = 'npm' }) {
  const list = (packages || []).filter(Boolean);
  if (!list.length) return { installed: [] };

  const t0 = performance.now();
  log?.({ level: 'cmd', msg: `$ ${manager} install ${list.join(' ')}` });
  await sleep(120);

  log?.({ level: 'pkg', msg: `npm WARN using simulated installer (preview loads from esm.sh)` });
  log?.({ level: 'pkg', msg: `(•) resolving ${list.length} package${list.length === 1 ? '' : 's'}…` });

  const installed = [];
  for (let i = 0; i < list.length; i++) {
    if (signal?.aborted) {
      log?.({ level: 'warn', msg: 'install aborted' });
      return { installed, aborted: true };
    }
    const pkg = list[i];
    const ver = versionFor(pkg);
    await sleep(timingFor(i, list.length));
    log?.({ level: 'pkg', msg: `→ resolving ${pkg}` });
    await sleep(timingFor(i, list.length) * 0.6);
    log?.({ level: 'pkg', msg: `→ fetching  ${pkg}@${ver}` });
    await sleep(timingFor(i, list.length) * 0.4);
    log?.({ level: 'pkg', msg: `+ ${pkg}@${ver}` });
    installed.push({ name: pkg, version: ver });
  }

  await sleep(180);
  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  log?.({ level: 'info', msg: `✓ added ${installed.length} package${installed.length === 1 ? '' : 's'} in ${dt}s` });
  log?.({ level: 'info', msg: `  preview is live — packages loaded via esm.sh importmap` });

  return { installed };
}

// Compute the diff of imported packages between two file snapshots.
// Returned packages are the ones that need to be "installed" this turn.
export function diffPackages(beforeList, afterList) {
  const before = new Set(beforeList || []);
  return (afterList || []).filter(p => !before.has(p));
}

// Patch a package.json file (in the conversation's `files` array) so that any
// newly-installed packages are pinned in `dependencies`. Returns the new files
// array (immutable) — or the original if package.json didn't exist / parse.
export function patchPackageJson(files, installed) {
  if (!installed?.length) return files;
  const idx = (files || []).findIndex(f => f.name === 'package.json');
  if (idx < 0) return files;
  const f = files[idx];
  let obj;
  try { obj = JSON.parse(f.code); } catch { return files; }
  obj.dependencies = obj.dependencies || {};
  let changed = false;
  for (const p of installed) {
    const verSpec = '^' + (p.version === 'latest' ? '0.0.0' : p.version);
    const desired = p.version === 'latest' ? 'latest' : verSpec;
    if (obj.dependencies[p.name] !== desired) {
      obj.dependencies[p.name] = desired;
      changed = true;
    }
  }
  if (!changed) return files;
  const next = [...files];
  next[idx] = { ...f, code: JSON.stringify(obj, null, 2) + '\n' };
  return next;
}
