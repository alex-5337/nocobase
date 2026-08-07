/**
 * Build a NocoBase plugin after automatically fixing up missing core type declarations
 * (lib/*.d.ts).
 *
 * Background: `yarn build <plugin>` resolves the built types of @nocobase/* packages
 * through node_modules while emitting .d.ts. When a core package (e.g. @nocobase/server)
 * is missing its lib/index.d.ts, the plugin build fails at the declaration stage with
 * errors like "Property 'db' does not exist". This script scans for core packages
 * missing lib/index.d.ts, builds them first, and then builds the target plugin(s).
 *
 * Usage:
 *   node scripts/build-plugin-with-deps.js <plugin-name> [more-plugins...]
 *   node scripts/build-plugin-with-deps.js @my-project/plugin-template-print
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT, 'packages', 'core');

// Packages that are NOT built to lib/ via the core build pipeline (buildCjs):
// - @nocobase/client / @nocobase/client-v2  -> built to es/
// - @nocobase/build                          -> built by its own tsup config
// - @nocobase/app                            -> app shell; its types are not used by plugins,
//                                               and building it triggers the full rsbuild client
const SKIP = new Set(['@nocobase/build', '@nocobase/client', '@nocobase/client-v2', '@nocobase/app']);

/** Find core packages whose lib/index.d.ts is missing (main field decides the output dir). */
function findMissingDtsPackages() {
  const missing = [];
  for (const dir of fs.readdirSync(CORE_DIR)) {
    const pkgDir = path.join(CORE_DIR, dir);
    const pkgPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgPath) || !fs.statSync(pkgPath).isFile()) {
      continue;
    }
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name || SKIP.has(pkg.name)) {
      continue;
    }
    const main = pkg.main || '';
    if (!main.startsWith('lib/') && !main.startsWith('./lib/')) {
      continue;
    }
    if (!fs.existsSync(path.join(pkgDir, 'lib', 'index.d.ts'))) {
      missing.push(pkg.name);
    }
  }
  return missing;
}

/**
 * Run `yarn <args>` (yarn is a global install, so spawn through the shell).
 * Returns true when the command succeeded (exit code 0).
 * Known noise: @nocobase/build's update-notifier may fail to write its cache inside a
 * restricted sandbox and exit with code 1 even though the build artifacts were produced.
 */
function runYarn(args) {
  console.log(`\n> yarn ${args.join(' ')}`);
  const result = spawnSync('yarn', args, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.warn(
      `\n[warning] command exited with code ${result.status}, check the logs above. ` +
        'If the error is only about "update-notifier / TRAE Sandbox / configstore", the build actually succeeded.',
    );
    return false;
  }
  return true;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/build-plugin-with-deps.js <plugin-name> [more-plugins...]');
  process.exit(1);
}

const missing = findMissingDtsPackages();
let allOk = true;
if (missing.length > 0) {
  console.log(`\nDetected ${missing.length} core package(s) missing lib/index.d.ts, building them first:`);
  missing.forEach((name) => console.log(`  - ${name}`));
  allOk = runYarn(['build', ...missing]) && allOk;
} else {
  console.log('\nAll core package type declarations are up to date, skipping the fix-up step.');
}

allOk = runYarn(['build', ...targets]) && allOk;
console.log('\nBuild finished.');
process.exit(allOk ? 0 : 1);
