require('dotenv').config();
const path = require('path');

const { openContext } = require('./browserContext');
const { ensureLoggedIn } = require('./login');
const { switchToShop } = require('./shopSwitcher');
const { exportProductAdsOverview, exportSearchAdsData, ADS_URL, DOWNLOAD_DIR } = require('./exportAds');

const SHOPS = (process.env.SHOP_NAMES || 'gentlecolors,bomi_supplements,mizumi_officialshop')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SHOP_COOLDOWN_MS = 65000; // Same export-throttle pacing used by the other Shopee pulls.
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
      const shopPage = await switchToShop(context, page, shopName, ADS_URL);
      try {
        const outputDir = path.join(DOWNLOAD_DIR, shopName);

        const overviewPath = await exportProductAdsOverview(shopPage, { shopName, outputDir });
        console.log(`Saved ads overview report to: ${overviewPath}`);

        console.log(`Waiting ${SHOP_COOLDOWN_MS / 1000}s before next export (export cooldown)...`);
        await sleep(SHOP_COOLDOWN_MS);

        const searchAdsPath = await exportSearchAdsData(shopPage, { shopName, outputDir });
        console.log(`Saved search ads report to: ${searchAdsPath}`);
      } catch (err) {
        await shopPage.screenshot({ path: path.join(__dirname, '..', `debug-fail-ads-${shopName}.png`) }).catch(() => {});
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
