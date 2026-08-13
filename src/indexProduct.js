require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { openContext } = require('./browserContext');
const { ensureLoggedIn } = require('./login');
const { switchToShop } = require('./shopSwitcher');
const { exportProductLast7DaysReport, productUrl } = require('./exportProduct');

const CONFIG_PATH = path.join(__dirname, '..', 'products.json');
const COOLDOWN_MS = 65000; // Same per-account export throttle as the shop-level script.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadProducts() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const headless = process.env.HEADLESS !== 'false';
  const products = loadProducts();

  const context = await openContext({ headless });
  try {
    const page = await ensureLoggedIn(context, { headless });

    let currentShop = null;
    let activePage = page;
    for (let i = 0; i < products.length; i++) {
      const { shop, productId } = products[i];
      if (i > 0) {
        console.log(`Waiting ${COOLDOWN_MS / 1000}s before next product (export cooldown)...`);
        await sleep(COOLDOWN_MS);
      }

      if (shop !== currentShop) {
        console.log(`Switching to shop: ${shop}`);
        // Go straight to this product's page instead of landing on the
        // overview page first — one navigation instead of two.
        activePage = await switchToShop(context, activePage, shop, productUrl(productId));
        currentShop = shop;
      }

      console.log(`Exporting product ${productId} (${shop})`);
      try {
        const savePath = await exportProductLast7DaysReport(activePage, { shopName: shop, productId });
        console.log(`Saved report to: ${savePath}`);
      } catch (err) {
        await activePage
          .screenshot({ path: path.join(__dirname, '..', `debug-fail-product-${productId}.png`) })
          .catch(() => {});
        console.error(`Failed on product ${productId} (${shop}) at URL ${activePage.url()}: ${err.message}`);
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
