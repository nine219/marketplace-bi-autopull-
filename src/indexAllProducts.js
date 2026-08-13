require('dotenv').config();
const path = require('path');

const { openContext } = require('./browserContext');
const { ensureLoggedIn } = require('./login');
const { switchToShop } = require('./shopSwitcher');
const {
  exportAllProductsYesterdayReport,
  exportAllProductsThisMonthReport,
  ALL_PRODUCTS_URL,
} = require('./exportAllProducts');

const SHOPS = (process.env.SHOP_NAMES || 'gentlecolors,bomi_supplements,mizumi_officialshop')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SHOP_COOLDOWN_MS = 65000; // Same per-account export throttle as the other scripts.
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
      const shopPage = await switchToShop(context, page, shopName, ALL_PRODUCTS_URL);
      try {
        const yesterdayPath = await exportAllProductsYesterdayReport(shopPage, { shopName });
        console.log(`Saved yesterday report to: ${yesterdayPath}`);

        // Same per-account export throttle applies between these two exports
        // as between shops.
        console.log(`Waiting ${SHOP_COOLDOWN_MS / 1000}s before this-month export (export cooldown)...`);
        await sleep(SHOP_COOLDOWN_MS);

        const monthPath = await exportAllProductsThisMonthReport(shopPage, { shopName });
        console.log(`Saved this-month report to: ${monthPath}`);
      } catch (err) {
        await shopPage
          .screenshot({ path: path.join(__dirname, '..', `debug-fail-allproducts-${shopName}.png`) })
          .catch(() => {});
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
