// Standalone command (npm run pull:fill-gaps) for when a previous pull:all
// run died partway through a step (e.g. one shop/account crashed the whole
// loop in index.js / indexAllProducts.js / lazada/index.js — see their
// per-item catch blocks, which log then re-throw). Since those scripts
// always write into downloads/{today}/ (no way to target a past date — see
// dateFolder.js usage in exportReport.js / exportCommon.js), this only ever
// checks and re-pulls today's folder.
//
// Only re-pulls the specific shops/accounts that are missing expected
// files, not everything — re-running a shop/account that already succeeded
// wastes time and risks tripping Shopee/Lazada's export throttling. Always
// finishes with an upload pass (Teams alerts happen there, per platform).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { todayDateFolder } = require('./dateFolder');

const ROOT = path.join(__dirname, '..');
const DATE = todayDateFolder();
const DOWNLOADS_DIR = path.join(ROOT, 'downloads', DATE);

const SHOPS = (process.env.SHOP_NAMES || 'gentlecolors,bomi_supplements,mizumi_officialshop')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LAZADA_ACCOUNT_KEYS = (process.env.LAZADA_ACCOUNTS || 'MIZUMI,BOMI,GC')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function countMatching(dir, prefix) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).length;
}

// One "shop.shopee.*.xlsx" for yesterday + one for this-month.
function shopStatsComplete(shop) {
  return countMatching(path.join(DOWNLOADS_DIR, shop), 'shop.shopee.') >= 2;
}

// One "product.shopee.*.xlsx" for yesterday + one for this-month.
function productsComplete(shop) {
  return countMatching(path.join(DOWNLOADS_DIR, 'product', shop), 'product.shopee.') >= 2;
}

// dashboard (yesterday+month), product performance (yesterday+month), promotion (1).
function lazadaComplete(accountKey) {
  const dir = path.join(DOWNLOADS_DIR, 'lazada', accountKey.toLowerCase());
  return (
    countMatching(dir, 'dashboard.lazada.') >= 2 &&
    countMatching(dir, 'product.lazada.') >= 2 &&
    countMatching(dir, 'promotion.lazada.') >= 1
  );
}

function runScoped(label, scriptRelPath, envOverrides) {
  console.log(`\n=== Re-pulling: ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, scriptRelPath)], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, ...envOverrides },
  });
  if (result.status !== 0) {
    console.error(`"${label}" retry still failed (exit code ${result.status}).`);
  }
}

console.log(`Checking downloads/${DATE}/ for missing files...`);

const missingShopStats = SHOPS.filter((s) => !shopStatsComplete(s));
const missingProducts = SHOPS.filter((s) => !productsComplete(s));
const missingLazada = LAZADA_ACCOUNT_KEYS.filter((a) => !lazadaComplete(a));

if (!missingShopStats.length && !missingProducts.length && !missingLazada.length) {
  console.log('Nothing missing — all expected files are already present.');
} else {
  if (missingShopStats.length) {
    console.log(`Shopee shop stats missing for: ${missingShopStats.join(', ')}`);
    runScoped('Shopee — shop stats', 'src/index.js', { SHOP_NAMES: missingShopStats.join(',') });
  }
  if (missingProducts.length) {
    console.log(`Shopee all-products missing for: ${missingProducts.join(', ')}`);
    runScoped('Shopee — all products', 'src/indexAllProducts.js', { SHOP_NAMES: missingProducts.join(',') });
  }
  if (missingLazada.length) {
    console.log(`Lazada missing for: ${missingLazada.join(', ')}`);
    runScoped('Lazada', 'src/lazada/index.js', { LAZADA_ACCOUNTS: missingLazada.join(',') });
  }

  const stillMissingShopStats = SHOPS.filter((s) => !shopStatsComplete(s));
  const stillMissingProducts = SHOPS.filter((s) => !productsComplete(s));
  const stillMissingLazada = LAZADA_ACCOUNT_KEYS.filter((a) => !lazadaComplete(a));
  if (stillMissingShopStats.length || stillMissingProducts.length || stillMissingLazada.length) {
    console.warn('\nStill incomplete after retry:');
    if (stillMissingShopStats.length) console.warn(`  Shopee shop stats: ${stillMissingShopStats.join(', ')}`);
    if (stillMissingProducts.length) console.warn(`  Shopee all-products: ${stillMissingProducts.join(', ')}`);
    if (stillMissingLazada.length) console.warn(`  Lazada: ${stillMissingLazada.join(', ')}`);
  } else {
    console.log('\nAll gaps filled.');
  }
}

console.log('\n=== Upload to SharePoint ===');
const uploadResult = spawnSync(process.execPath, [path.join(ROOT, 'src/uploadToSharePoint.js')], {
  stdio: 'inherit',
  cwd: ROOT,
});
process.exit(uploadResult.status || 0);
