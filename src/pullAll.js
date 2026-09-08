// Runs every pull pipeline, then uploads everything to SharePoint once at
// the end — meant for a single daily run. Each step is a separate script
// (not an importable function), so they're spawned as child processes
// rather than required in-process; this also means a crash/exit in one
// step can't take down the others' Node state.
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const { todayDateFolder } = require('./dateFolder');
const { sendTeamsAlert } = require('./teamsAlert');

const ROOT = path.join(__dirname, '..');

// Upload step's own Teams alerts (see uploadToSharePoint.js) already cover
// success/failure with a real SharePoint link, so it's excluded here —
// platform is only set for steps that should trigger an immediate Error
// alert (with no link) if they fail before upload ever runs.
const STEPS = [
  ['Shopee — shop stats', 'src/index.js', 'Shopee'],
  ['Shopee — all products', 'src/indexAllProducts.js', 'Shopee'],
  ['Lazada', 'src/lazada/index.js', 'Lazada'],
  ['Upload to SharePoint', 'src/uploadToSharePoint.js', null],
];

for (const [label, scriptRelPath, platform] of STEPS) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, scriptRelPath)], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (result.status !== 0) {
    console.error(`\nStopped: "${label}" failed (exit code ${result.status}).`);
    if (platform) {
      sendTeamsAlert({ date: todayDateFolder(), platform, status: 'Error', link: '' })
        .finally(() => process.exit(result.status || 1));
      break;
    }
    process.exit(result.status || 1);
  }
}

console.log('\nAll steps completed successfully.');
