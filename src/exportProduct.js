const path = require('path');
const fs = require('fs');
const {
  selectDatePreset,
  clickDownload,
  yesterdayYYYYMMDD,
  daysAgoYYYYMMDD,
  waitUntilPageReady,
  humanPause,
  DOWNLOAD_DIR,
} = require('./exportReport');

function productUrl(productId) {
  return `https://seller.shopee.co.th/datacenter/product/performance/details?id=${productId}`;
}

// Product performance page has no single-day "เมื่อวาน" preset (unlike the
// shop-level Business Insights page) — its calendar-based presets like
// "ภายในอาทิตย์" apply a whole week on one click, not a chosen single day.
// Closest available granularity is "ย้อนหลัง 7 วัน" (last 7 days), which
// resolves to [today-7, today-1] (verified live: e.g. 02-07 to 08-07).
async function exportProductLast7DaysReport(page, { shopName, productId, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, 'product', shopName, productId);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // Skip navigating if switchToShop already landed directly on this exact
  // product page (it's called with the product URL as its target) — avoids
  // a redundant reload.
  //
  // No networkidle wait here: this page has continuous background polling
  // (chat widget, analytics pings) that keeps the network busy, so
  // networkidle would just burn the full 30s timeout every run. Instead,
  // poll for the page to actually become usable — handles the "สร้างแท็ก"
  // onboarding tooltip and Shopee's occasional password re-verification
  // modal along the way, whichever (if any) shows up.
  const targetUrl = productUrl(productId);
  if (page.url() !== targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }

  const ready = await waitUntilPageReady(page);
  if (!ready) throw new Error(`Page did not become ready for product ${productId}`);

  await humanPause();
  await selectDatePreset(page, 'ย้อนหลัง 7 วัน');
  const download = await clickDownload(page);

  const startStr = daysAgoYYYYMMDD(7);
  const endStr = yesterdayYYYYMMDD();
  const filename = `${shopName}_product-${productId}_${startStr}-${endStr}.xlsx`;
  const savePath = path.join(targetDir, filename);
  await download.saveAs(savePath);

  return savePath;
}

module.exports = { exportProductLast7DaysReport, productUrl };
