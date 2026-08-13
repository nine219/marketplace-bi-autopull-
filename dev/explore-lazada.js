// Throwaway exploration script — NOT part of the final automation.
// Manual sanity-check tool for the Lazada Seller Center automation in
// src/lazada/: logs in as one account, visits each report page, and takes
// screenshots — useful for re-verifying selectors if Lazada changes its UI.
// Findings from the original exploration are documented as comments in the
// src/lazada/*.js files themselves.
require('dotenv').config();
const path = require('path');
const { openContext } = require('../src/lazada/browserContext');
const { login, logout } = require('../src/lazada/login');
const { DASHBOARD_URL } = require('../src/lazada/exportDashboard');
const { PRODUCT_PERFORMANCE_URL } = require('../src/lazada/exportProductPerformance');
const { PROMOTION_URL } = require('../src/lazada/exportPromotion');

const OUT = __dirname;
const ACCOUNT_KEY = process.argv[2] || 'MIZUMI';

(async () => {
  const context = await openContext({ headless: false });
  let page;
  try {
    page = context.pages()[0] || (await context.newPage());
    await login(page, {
      email: process.env[`LAZADA_${ACCOUNT_KEY}_EMAIL`],
      password: process.env[`LAZADA_${ACCOUNT_KEY}_PASSWORD`],
    });
    console.log('Logged in:', page.url());

    for (const [label, url] of [
      ['dashboard', DASHBOARD_URL],
      ['product-performance', PRODUCT_PERFORMANCE_URL],
      ['promotion', PROMOTION_URL],
    ]) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.screenshot({ path: path.join(OUT, `check-${label}.png`) });
      console.log(`Screenshotted: ${label}`);
    }

    await logout(page);
    console.log('Logged out:', page.url());
  } catch (e) {
    console.error('ERR', e.message);
    if (page) await page.screenshot({ path: path.join(OUT, 'check-error.png') }).catch(() => {});
  } finally {
    await context.close();
  }
})();
