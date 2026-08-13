const path = require('path');
const fs = require('fs');
const {
  selectDatePreset,
  selectThisMonth,
  waitUntilPageReady,
  yesterdayYYYYMMDD,
  firstOfMonthYYYYMMDD,
  reportFilename,
  DOWNLOAD_DIR,
} = require('./exportReport');

const ALL_PRODUCTS_URL = 'https://seller.shopee.co.th/datacenter/product/performance';

// div.eds-selector__inner is reused by multiple unrelated dropdowns on this
// page (e.g. the "ร้านค้าปัจจุบัน/ร้านค้าในประเทศ" toggle) — scope to the
// one whose current text is one of this control's two known values so we
// grab the right one regardless of which is currently selected.
async function selectOrderTypeAll(page) {
  const trigger = page.locator('div.eds-selector__inner', { hasText: /^(ยืนยันแล้ว|ทั้งหมด)$/ }).first();
  await trigger.waitFor({ state: 'visible', timeout: 15000 });
  await trigger.evaluate((el) => el.click());
  await page.waitForTimeout(400);

  // "ทั้งหมด" also exists as a hidden duplicate elsewhere (category filter) —
  // same issue as the date-range dropdown — so filter by actual visibility
  // and click via raw DOM click rather than Playwright's pointer click.
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.textContent.trim() === 'ทั้งหมด' && el.offsetWidth > 0 && el.offsetHeight > 0
    );
    if (!candidates.length) return false;
    candidates[0].click();
    return true;
  });
  if (!clicked) throw new Error('Could not find visible "ทั้งหมด" option for order type');
}

// Clicking download here queues a report (Shopee's "Download Center" flow)
// instead of an instant browser download — the "รายงานล่าสุด" (latest
// reports) panel auto-opens afterward with no extra click needed, showing
// the new row as "กำลังดำเนินการ" (in progress) until it turns into a
// clickable "ดาวน์โหลด" button.
//
// Verified DOM structure: div.list > div.list-item (one per queued job,
// NEWEST PREPENDED TO THE TOP) > div.status, which is bare text
// "กำลังดำเนินการ" while queued, or a <button> containing "ดาวน์โหลด" once
// ready. Must scope to the topmost .list-item specifically — a page-wide
// search for "ดาวน์โหลด" text matches whichever row happens to be ready
// first, which is very often an OLDER already-completed job further down
// the list while ours (topmost) is still processing, silently downloading
// the wrong file. Also, "กำลังดำเนินการ" sits directly in div.status
// alongside an icon, so it's never a bare text leaf — a leaf-only text
// match for it never fires, which is why the old code fell through
// straight to matching a stale "ดาวน์โหลด" elsewhere on the page.
async function waitForQueuedReportAndDownload(page, { maxWaitMs = 120000 } = {}) {
  // ".list-item" alone is too generic (matches unrelated widgets elsewhere
  // on the page) — scope through ".shopee-export-button", the distinctive
  // wrapper class for this specific download-center flyout. The list's
  // first .list-item is a column-header row ("ชื่อรายงาน / การดำเนินการ")
  // with no filename/button, so filter to rows that actually contain a
  // filename (".xlsx") before taking the first (= newest, jobs are
  // prepended to the top) — a bare .first() grabs the header and waits
  // forever for a button that will never appear there.
  const newestItem = page.locator('.shopee-export-button .list-item', { hasText: '.xlsx' }).first();
  await newestItem.waitFor({ state: 'visible', timeout: 15000 });

  const downloadButton = newestItem.locator('button', { hasText: 'ดาวน์โหลด' });
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await downloadButton.isVisible().catch(() => false)) break;
    await page.waitForTimeout(3000);
  }
  if (!(await downloadButton.isVisible().catch(() => false))) {
    throw new Error('Timed out waiting for queued report to be ready');
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    downloadButton.click(),
  ]);
  return download;
}

async function goToAllProductsReady(page) {
  if (page.url() !== ALL_PRODUCTS_URL) {
    await page.goto(ALL_PRODUCTS_URL, { waitUntil: 'domcontentloaded' });
  }
  const ready = await waitUntilPageReady(page);
  if (!ready) throw new Error('All-products page did not become ready');
}

async function downloadAllProductsReport(page, { shopName, outputDir, startYYYYMMDD, endYYYYMMDD }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, 'product', shopName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  await selectOrderTypeAll(page);

  const downloadButton = page.getByText('ดาวน์โหลดข้อมูล', { exact: true }).first();
  await downloadButton.waitFor({ state: 'visible', timeout: 15000 });
  await downloadButton.evaluate((el) => el.click());

  const download = await waitForQueuedReportAndDownload(page);

  const filename = reportFilename(shopName, startYYYYMMDD, endYYYYMMDD, 'product');
  const savePath = path.join(targetDir, filename);
  await download.saveAs(savePath);

  return savePath;
}

async function exportAllProductsYesterdayReport(page, { shopName, outputDir }) {
  await goToAllProductsReady(page);
  await selectDatePreset(page, 'เมื่อวาน');

  const dateStr = yesterdayYYYYMMDD();
  return downloadAllProductsReport(page, { shopName, outputDir, startYYYYMMDD: dateStr, endYYYYMMDD: dateStr });
}

// Exports the "this month" (month-to-date) all-products report, same
// month-grid selection as the shop-stats export (see selectThisMonth).
async function exportAllProductsThisMonthReport(page, { shopName, outputDir }) {
  await goToAllProductsReady(page);
  await selectThisMonth(page);

  return downloadAllProductsReport(page, {
    shopName,
    outputDir,
    startYYYYMMDD: firstOfMonthYYYYMMDD(),
    endYYYYMMDD: yesterdayYYYYMMDD(),
  });
}

module.exports = { exportAllProductsYesterdayReport, exportAllProductsThisMonthReport, ALL_PRODUCTS_URL };
