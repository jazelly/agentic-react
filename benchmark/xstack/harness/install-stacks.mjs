// Install every stack template (base + agentic variant) into work/stacks/<id>/<variant>.
// Isolated: each install has its own lockfile and uses --ignore-workspace so nothing touches the agentic-react workspace.
// usage: node harness/install-stacks.mjs [stackId ...] [--variant base|agentic] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { STACK_IDS, STACKS_DIR, loadStack, stackInstallDir, sh, rmrf, applyEdits } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const vi = args.indexOf('--variant');
const variants = vi >= 0 ? [args[vi + 1]] : ['base', 'agentic'];
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--variant');
for (const id of ids.length ? ids : STACK_IDS) {
  const stack = loadStack(id);
  for (const v of variants) {
    if (v === 'agentic' && !stack.agentic) { console.log(`- ${id}/agentic: no adapter (${stack.agentic_note ?? 'n/a'}) -> uses base`); continue; }
    const dst = stackInstallDir(id, v);
    if (!force && fs.existsSync(path.join(dst, 'node_modules'))) { console.log(`= ${id}/${v} already installed`); continue; }
    rmrf(dst);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(path.join(STACKS_DIR, id, 'template'), dst, { recursive: true });
    if (v === 'agentic') {
      const pj = JSON.parse(fs.readFileSync(path.join(dst, 'package.json'), 'utf8'));
      for (const spec of stack.agentic.packages) { const at = spec.lastIndexOf('@'); pj.devDependencies[spec.slice(0, at)] = spec.slice(at + 1); }
      fs.writeFileSync(path.join(dst, 'package.json'), JSON.stringify(pj, null, 2) + '\n');
      applyEdits(dst, stack.agentic.edits);
    }
    const lock = path.join(STACKS_DIR, id, `pnpm-lock.${v}.yaml`);
    if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(dst, 'pnpm-lock.yaml'));
    const t0 = Date.now();
    const r = sh(`pnpm install --ignore-workspace --config.confirmModulesPurge=false --reporter=append-only ${fs.existsSync(lock) ? '--frozen-lockfile' : ''}`, { cwd: dst, timeoutSec: 1200 });
    console.log(`${r.ok ? 'ok ' : 'ERR'} ${id}/${v} install ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (!r.ok) { console.log(r.output.slice(-3000)); continue; }
    if (!fs.existsSync(lock)) fs.copyFileSync(path.join(dst, 'pnpm-lock.yaml'), lock); // pin for reproducibility
  }
}
