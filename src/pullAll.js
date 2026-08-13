// Runs every pull pipeline, then uploads everything to SharePoint once at
// the end — meant for a single daily run. Each step is a separate script
// (not an importable function), so they're spawned as child processes
// rather than required in-process; this also means a crash/exit in one
// step can't take down the others' Node state.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const STEPS = [
  ['Shopee — shop stats', 'src/index.js'],
  ['Shopee — all products', 'src/indexAllProducts.js'],
  ['Lazada', 'src/lazada/index.js'],
  ['Upload to SharePoint', 'src/uploadToSharePoint.js'],
];

for (const [label, scriptRelPath] of STEPS) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, scriptRelPath)], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (result.status !== 0) {
    console.error(`\nStopped: "${label}" failed (exit code ${result.status}).`);
    process.exit(result.status || 1);
  }
}

console.log('\nAll steps completed successfully.');
