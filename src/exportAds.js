const path = require('path');
const fs = require('fs');
const { todayDateFolder } = require('./dateFolder');
const { waitUntilPageReady, humanPause, brandFor, yesterdayYYYYMMDD } = require('./exportReport');

const ADS_URL = 'https://seller.shopee.co.th/portal/marketing/pas/index?source_page_id=1';
const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads', todayDateFolder());
const PLATFORM = 'shopee';

function reportFilename(reportType, shopName, dateYYYYMMDD) {
  return `${reportType}.${PLATFORM}.${brandFor(shopName)}.${dateYYYYMMDD}.csv`;
}

// The Ads page's date-range control is a different component from the BI
// dashboard's (div.ads-date-range-picker, not span.value) — opens a flyout
// with flat presets ("วันนี้", "เมื่อวาน", "1 สัปดาห์", ...) on the left and
// a calendar on the right; presets apply immediately on click.
async function selectAdsYesterday(page) {
  const trigger = page.locator('div.ads-date-range-picker').first();
  await trigger.waitFor({ state: 'visible', timeout: 30000 });
  await humanPause();
  await clickResilient(page, trigger);
  await humanPause();

  const option = page.getByText('เมื่อวาน', { exact: true }).first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await clickResilient(page, option);
  await humanPause();
}

// Each real result row (excluding the "ชื่อรายงาน/ตัวเลือก" header, which
// is also a .list-item but has no data-testid) carries a stable
// data-test-timestamp — verified live. Report names are date-based, not
// unique (a fresh "yesterday" request looks identical to an older one for
// the same date), so this timestamp — not position or filename — is what
// identifies our own request.
const RESULT_ITEM_SELECTOR = '.export-container .list .list-item[data-testid="export-data-result-item"]';

async function firstResultTimestamp(page) {
  const first = page.locator(RESULT_ITEM_SELECTOR).first();
  const has = await first.count();
  if (!has) return null;
  return first.getAttribute('data-test-timestamp');
}

// Opens the "ดาวน์โหลดข้อมูล" dropdown (present in every Shopee Ads tab —
// โฆษณาสินค้า/โฆษณาคำค้นหา/etc.) and clicks the named report type
// (e.g. "ภาพรวมข้อมูลโฆษณา", "ข้อมูลโฆษณาคำค้นหา"), which immediately
// queues a report and opens the "รายงานล่าสุด" (recent reports) history
// panel. Returns the timestamp of whatever was the top result row just
// before requesting, so the caller can recognize the new row once it
// appears (a fresh request can otherwise look identical to an older one —
// same filename, same date — so position/name alone can't tell them apart).
async function requestReport(page, reportTypeLabel) {
  const baselineTimestamp = await firstResultTimestamp(page);

  const downloadBtn = page.getByText('ดาวน์โหลดข้อมูล', { exact: true }).first();
  await downloadBtn.waitFor({ state: 'visible', timeout: 15000 });
  await humanPause();
  await clickResilient(page, downloadBtn);
  await humanPause();

  const option = page.getByText(reportTypeLabel, { exact: false }).first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await clickResilient(page, option);

  return baselineTimestamp;
}

// Polls the top result row until a NEW row appears (its
// data-test-timestamp differs from baselineTimestamp) and that row shows a
// real "ดาวน์โหลด" button rather than the "กำลังดำเนินการ" spinner.
async function waitForNewReportReady(page, baselineTimestamp, { timeoutMs = 180000 } = {}) {
  const firstItem = page.locator(RESULT_ITEM_SELECTOR).first();
  await firstItem.waitFor({ state: 'visible', timeout: 15000 });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentTimestamp = await firstItem.getAttribute('data-test-timestamp').catch(() => null);
    if (currentTimestamp && currentTimestamp !== baselineTimestamp) {
      const ready = await firstItem.locator('button.eds-button--primary').isVisible().catch(() => false);
      if (ready) return firstItem;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('Timed out waiting for the requested Ads report to finish generating');
}

// Shopee shows all sorts of one-off popups on this page (promo campaign
// announcements, feedback surveys, diagnosis-tool dialogs, ad-creation
// wizards, a "rewards" prompt, ...), and — verified live on real shops'
// persisted sessions — they can pile up several deep in the DOM at once (5
// stacked .eds-modal elements seen together), with only the topmost
// actually rendered and blocking clicks; the rest sit inertly behind it
// (closed ones are left in the DOM with display:none rather than removed).
//
// The outer .eds-modal div itself is an unstyled, zero-size wrapper — the
// actual full-viewport overlay is its child .eds-modal__mask — so
// `.eds-modal:visible` never matches anything (confirmed live: it reported
// 0 while a modal was visibly on screen blocking every click). Checking
// `:visible` on the mask instead is what actually reflects whether that
// modal is showing.
async function dismissAllModals(page, { maxAttempts = 10 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const visibleModals = page.locator('.eds-modal:has(.eds-modal__mask:visible)');
    const count = await visibleModals.count().catch(() => 0);
    if (count === 0) return;

    const topModal = visibleModals.last();
    const label = await topModal.evaluate((el) => el.className).catch(() => '(unknown)');
    const closeIcon = topModal.locator('.eds-modal__close').first();
    if (await closeIcon.count()) {
      await closeIcon.click({ timeout: 5000 }).catch(() => {});
      console.log(`Dismissed popup modal (${label}) via close icon.`);
    } else {
      const closeText = topModal.getByText(/^ปิด$/, { exact: true }).first();
      if (await closeText.count()) {
        await closeText.click({ timeout: 5000 }).catch(() => {});
        console.log(`Dismissed popup modal (${label}) via "ปิด" button.`);
      } else {
        await page.keyboard.press('Escape').catch(() => {});
        console.log(`Dismissed popup modal (${label}) via Escape key.`);
      }
    }
    await page.waitForTimeout(700);
  }
}

// A one-time modal check before clicking isn't enough — a popup can render
// a moment AFTER that check passes (verified live: it blocked the exact
// same "โฆษณาสินค้า" tab click on a later run despite an upfront check
// finding nothing), so it lands mid-click instead. Retries the click
// itself, dismissing any modal(s) whenever one is what blocked us.
async function clickResilient(page, locator, { attempts = 15, timeoutPerAttempt = 5000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await locator.click({ timeout: timeoutPerAttempt });
      return;
    } catch (err) {
      lastErr = err;
      await dismissAllModals(page);
    }
  }
  throw lastErr;
}

async function downloadNewReport(page, baselineTimestamp, { timeoutMs } = {}) {
  const item = await waitForNewReportReady(page, baselineTimestamp, { timeoutMs });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    item.locator('button.eds-button--primary').click(),
  ]);
  return download;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Exports yesterday's "ภาพรวมข้อมูลโฆษณา" (ads overview) report from the
// โฆษณาสินค้า (Product Ads) tab — the tab selected by default on ADS_URL.
async function exportProductAdsOverview(page, { shopName, outputDir }) {
  const targetDir = outputDir || DOWNLOAD_DIR;
  ensureDir(targetDir);

  await waitUntilPageReady(page);
  await dismissAllModals(page);
  await clickResilient(page, page.getByText('โฆษณาสินค้า', { exact: true }).first());
  await humanPause();
  await selectAdsYesterday(page);
  const baselineTimestamp = await requestReport(page, 'ภาพรวมข้อมูลโฆษณา');

  const download = await downloadNewReport(page, baselineTimestamp);
  const savePath = path.join(targetDir, reportFilename('ads_overview', shopName, yesterdayYYYYMMDD()));
  await download.saveAs(savePath);
  return savePath;
}

// Exports yesterday's "ข้อมูลโฆษณาคำค้นหา" (search/keyword ads) report from
// the โฆษณาคำค้นหา tab.
async function exportSearchAdsData(page, { shopName, outputDir }) {
  const targetDir = outputDir || DOWNLOAD_DIR;
  ensureDir(targetDir);

  await waitUntilPageReady(page);
  await dismissAllModals(page);
  await clickResilient(page, page.getByText('โฆษณาคำค้นหา', { exact: true }).first());
  await humanPause();
  await selectAdsYesterday(page);
  const baselineTimestamp = await requestReport(page, 'ข้อมูลโฆษณาคำค้นหา');

  const download = await downloadNewReport(page, baselineTimestamp);
  const savePath = path.join(targetDir, reportFilename('ads_search', shopName, yesterdayYYYYMMDD()));
  await download.saveAs(savePath);
  return savePath;
}

module.exports = {
  ADS_URL,
  DOWNLOAD_DIR,
  reportFilename,
  selectAdsYesterday,
  dismissAllModals,
  requestReport,
  waitForNewReportReady,
  downloadNewReport,
  exportProductAdsOverview,
  exportSearchAdsData,
};
