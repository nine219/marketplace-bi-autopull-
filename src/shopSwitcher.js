const { PORTAL_URL, BI_URL } = require('./login');

// From the shop-picker page (portal/shop), finds the row whose account name
// matches shopAccountName (e.g. "gentlecolors") and clicks its "รายละเอียด"
// link, then goes directly to targetUrl for that shop (defaults to the
// Business Insights overview page). Passing the actual destination (e.g. a
// specific product's URL) avoids landing on overview first and then
// immediately navigating away — one page load instead of two. Returns the
// page actually showing the data (Shopee may open the shop in a new tab).
async function switchToShop(context, page, shopAccountName, targetUrl = BI_URL) {
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

  const row = page.locator('tr', { hasText: shopAccountName });
  await row.waitFor({ state: 'visible', timeout: 15000 });

  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
    row.getByText('รายละเอียด', { exact: true }).click(),
  ]);

  const activePage = popup || page;
  await activePage.waitForLoadState('domcontentloaded');
  // Clicking "รายละเอียด" kicks off Shopee's own redirect chain (oauth
  // exchange -> seller.shopee.co.th/?sig=...) which can still be in flight
  // here — racing our own goto against it throws "Navigation ...
  // interrupted by another navigation". Let it settle, then navigate to
  // the real target; retry once if we still lose the race.
  await activePage.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  try {
    await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    if (!/interrupted by another navigation/.test(err.message)) throw err;
    await activePage.waitForLoadState('domcontentloaded').catch(() => {});
    await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
  // The dashboard widgets (date-range control, metrics) load asynchronously
  // after domcontentloaded — give them time to finish before interacting.
  await activePage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  return activePage;
}

module.exports = { switchToShop };
