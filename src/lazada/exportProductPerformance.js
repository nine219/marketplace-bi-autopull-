const path = require('path');
const { yesterdayCompact, previousMonthRange } = require('./dates');
const { DOWNLOAD_DIR, reportFilename, clickExportAndDownload, ensureDir, humanPause } = require('./exportCommon');

const PRODUCT_PERFORMANCE_URL = 'https://sellercenter.lazada.co.th/ba/product/performance';

function productMonthUrl(startDash, endDash) {
  return `${PRODUCT_PERFORMANCE_URL}?dateType=month&dateRange=${startDash}%7C${endDash}`;
}

// This page has intermittently loaded with a completely blank content area
// (sidebar/footer render fine, but no table, no export button) even after
// networkidle — observed live on two different accounts. Reloading once
// resolves it every time it's been seen, so retry once before giving up
// rather than failing the whole run over a transient render glitch.
async function gotoProductPerformance(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const exportBtn = page.getByText('นำข้อมูลออก', { exact: true }).first();
  const appeared = await exportBtn
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) return;

  console.log('Product-performance page loaded blank — reloading once...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await exportBtn.waitFor({ state: 'visible', timeout: 20000 });
}

// Default product-performance view is "เมื่อวาน" (yesterday) — verified live.
async function exportProductYesterday(page, { accountKey, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  ensureDir(targetDir);

  await gotoProductPerformance(page, PRODUCT_PERFORMANCE_URL);
  await humanPause();

  const download = await clickExportAndDownload(page);
  const dateStr = yesterdayCompact();
  const savePath = path.join(targetDir, reportFilename('product', accountKey, dateStr, dateStr));
  await download.saveAs(savePath);
  return savePath;
}

// Previous FULL calendar month — NOT current month-to-date. Verified live:
// requesting the current in-progress month here shows "ไม่มีข้อมูล" (no
// data); only a fully-completed month returns real numbers. This is the
// behavior docs/lazada.txt refers to as the page defaulting to "month -1" —
// it's not a default to override so much as the only month range that
// actually has data.
async function exportProductLastMonth(page, { accountKey, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  ensureDir(targetDir);

  const { start, end } = previousMonthRange();
  await gotoProductPerformance(page, productMonthUrl(start, end));
  await humanPause();

  const download = await clickExportAndDownload(page);
  const startCompact = start.replace(/-/g, '');
  const endCompact = end.replace(/-/g, '');
  const savePath = path.join(targetDir, reportFilename('product', accountKey, startCompact, endCompact));
  await download.saveAs(savePath);
  return savePath;
}

module.exports = { exportProductYesterday, exportProductLastMonth, PRODUCT_PERFORMANCE_URL };
