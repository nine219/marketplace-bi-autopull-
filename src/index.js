require('dotenv').config();
const path = require('path');

const { openContext } = require('./browserContext');
const { ensureLoggedIn } = require('./login');
const { switchToShop } = require('./shopSwitcher');
const { exportYesterdayReport, exportThisMonthReport, DOWNLOAD_DIR } = require('./exportReport');

const SHOPS = (process.env.SHOP_NAMES || 'gentlecolors,bomi_supplements,mizumi_officialshop')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SHOP_COOLDOWN_MS = 65000; // Shopee appears to throttle the export endpoint per account — space out consecutive shop exports.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const headless = process.env.HEADLESS !== 'false';

  const context = await openContext({ headless });
  try {
    const page = await ensureLoggedIn(context, { headless });

    for (let i = 0; i < SHOPS.length; i++) {
      const shopName = SHOPS[i];
      if (i > 0) {
        console.log(`Waiting ${SHOP_COOLDOWN_MS / 1000}s before next shop (export cooldown)...`);
        await sleep(SHOP_COOLDOWN_MS);
      }
      console.log(`Switching to shop: ${shopName}`);
      const shopPage = await switchToShop(context, page, shopName);
      try {
        const outputDir = path.join(DOWNLOAD_DIR, shopName);

        const yesterdayPath = await exportYesterdayReport(shopPage, { shopName, outputDir });
        console.log(`Saved yesterday report to: ${yesterdayPath}`);

        // Two exports on the same account back-to-back also hit Shopee's
        // per-account export throttle, so space them out just like we do
        // between shops before pulling the month-to-date report.
        console.log(`Waiting ${SHOP_COOLDOWN_MS / 1000}s before this-month export (export cooldown)...`);
        await sleep(SHOP_COOLDOWN_MS);

        const monthPath = await exportThisMonthReport(shopPage, { shopName, outputDir });
        console.log(`Saved this-month report to: ${monthPath}`);
      } catch (err) {
        await shopPage.screenshot({ path: path.join(__dirname, '..', `debug-fail-${shopName}.png`) }).catch(() => {});
        console.error(`Failed on shop ${shopName} at URL ${shopPage.url()}: ${err.message}`);
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
