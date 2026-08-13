require('dotenv').config();
const path = require('path');

const { openContext } = require('./browserContext');
const { login, logout } = require('./login');
const { exportDashboardYesterday, exportDashboardThisMonth } = require('./exportDashboard');
const { exportProductYesterday, exportProductLastMonth } = require('./exportProductPerformance');
const { exportPromotionCampaigns } = require('./exportPromotion');
const { DOWNLOAD_DIR } = require('./exportCommon');

// Each Lazada shop is a fully separate account (unlike Shopee's single
// login + shop switcher) — every shop needs its own full login/export/
// logout cycle. Account keys match the .env prefix: LAZADA_{KEY}_EMAIL /
// LAZADA_{KEY}_PASSWORD.
const ACCOUNT_KEYS = (process.env.LAZADA_ACCOUNTS || 'MIZUMI,BOMI,GC')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const EXPORT_COOLDOWN_MS = 8000; // Pace between exports within one account.
const ACCOUNT_COOLDOWN_MS = 20000; // Pace between accounts (full logout/login cycle).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function credentialsFor(accountKey) {
  const email = process.env[`LAZADA_${accountKey}_EMAIL`];
  const password = process.env[`LAZADA_${accountKey}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Missing LAZADA_${accountKey}_EMAIL / LAZADA_${accountKey}_PASSWORD in .env`);
  }
  return { email, password };
}

async function exportAccount(page, accountKey) {
  const outputDir = path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  const steps = [
    ['dashboard (yesterday)', () => exportDashboardYesterday(page, { accountKey, outputDir })],
    ['dashboard (this month)', () => exportDashboardThisMonth(page, { accountKey, outputDir })],
    ['product performance (yesterday)', () => exportProductYesterday(page, { accountKey, outputDir })],
    ['product performance (last month)', () => exportProductLastMonth(page, { accountKey, outputDir })],
    ['promotion campaigns', () => exportPromotionCampaigns(page, { accountKey, outputDir })],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [label, run] = steps[i];
    if (i > 0) {
      console.log(`Waiting ${EXPORT_COOLDOWN_MS / 1000}s before next export...`);
      await sleep(EXPORT_COOLDOWN_MS);
    }
    console.log(`Exporting ${label}...`);
    const savePath = await run();
    console.log(`Saved to: ${savePath}`);
  }
}

async function main() {
  const headless = process.env.HEADLESS !== 'false';
  const context = await openContext({ headless });

  try {
    for (let i = 0; i < ACCOUNT_KEYS.length; i++) {
      const accountKey = ACCOUNT_KEYS[i];
      if (i > 0) {
        console.log(`Waiting ${ACCOUNT_COOLDOWN_MS / 1000}s before next account...`);
        await sleep(ACCOUNT_COOLDOWN_MS);
      }

      const page = context.pages()[0] || (await context.newPage());
      console.log(`Logging into: ${accountKey}`);
      try {
        await login(page, credentialsFor(accountKey));
        await exportAccount(page, accountKey);
        console.log(`Logging out of: ${accountKey}`);
        await logout(page);
      } catch (err) {
        await page
          .screenshot({ path: path.join(__dirname, '..', '..', `debug-fail-lazada-${accountKey}.png`) })
          .catch(() => {});
        console.error(`Failed on account ${accountKey} at URL ${page.url()}: ${err.message}`);
        throw err;
      }
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
