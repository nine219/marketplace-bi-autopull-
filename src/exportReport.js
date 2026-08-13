const path = require('path');
const fs = require('fs');
const { todayDateFolder } = require('./dateFolder');

// Each day's run gets its own dated folder, e.g. downloads/2026-08-06/... —
// matches the dated folder structure used on the SharePoint upload side.
const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads', todayDateFolder());

// Output filenames follow: shop.{platform}.{brand}.{start}_{end}.xlsx
// (e.g. shop.shopee.mizumi.20260701_20260721.xlsx). "shop" is a literal
// marking this as a shop-level stats report; brand is the short brand name
// mapped from the Shopee shop account name below.
const PLATFORM = 'shopee';
const BRAND_BY_SHOP = {
  gentlecolors: 'gentlecolors',
  bomi_supplements: 'bomi',
  mizumi_officialshop: 'mizumi',
};
function brandFor(shopName) {
  return BRAND_BY_SHOP[shopName] || shopName;
}
function reportFilename(shopName, startYYYYMMDD, endYYYYMMDD, reportType = 'shop') {
  return `${reportType}.${PLATFORM}.${brandFor(shopName)}.${startYYYYMMDD}_${endYYYYMMDD}.xlsx`;
}

function formatYYYYMMDD(date) {
  // Format in Asia/Bangkok (GMT+7) regardless of the host machine's timezone.
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const y = bangkok.getUTCFullYear();
  const m = String(bangkok.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bangkok.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function yesterdayYYYYMMDD() {
  return daysAgoYYYYMMDD(1);
}

function daysAgoYYYYMMDD(n) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - n);
  return formatYYYYMMDD(now);
}

// First day of the current month in Asia/Bangkok, e.g. "20260701" — the start
// date of the month-to-date ("this month") export.
function firstOfMonthYYYYMMDD() {
  const bangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = bangkok.getUTCFullYear();
  const m = String(bangkok.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}01`;
}

// Deliberate pacing so the script doesn't click through pages instantly —
// clicking at inhuman speed is a bot tell. Random within [minMs, maxMs]
// rather than a fixed delay, so the timing doesn't look mechanical either.
function humanPause(minMs = 400, maxMs = 1000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Opens the date-range dropdown and clicks a top-level preset by its exact
// visible label (e.g. "เมื่อวาน", "ย้อนหลัง 7 วัน") — these presets apply
// immediately on click, no separate confirm step needed. Selectors are
// text-based since Shopee's DOM has no stable IDs/classes for this — if
// Shopee changes these labels, this is the first place to fix.
async function selectDatePreset(page, presetLabel) {
  // Scoped to span.value: the visible trigger showing the current range.
  // Not matched by its text, since the displayed value depends on whatever
  // range was last picked (e.g. it stays on the last choice across shop
  // switches within the same run) — span.value is verified unique on this
  // page, so matching by class alone is more robust than matching content.
  const rangeTrigger = page.locator('span.value').first();
  await rangeTrigger.waitFor({ state: 'visible', timeout: 30000 });
  await humanPause();
  await rangeTrigger.click();
  await humanPause();

  // An earlier "apply button" click here matched the unrelated order-type
  // control (its "ยืนยันแล้ว" label contains "ยืนยัน" too) and misclicked
  // it — presets don't need a confirm step, so that was removed.
  //
  // Clicked via in-page el.click() rather than Playwright's locator.click():
  // this flyout is flaky under real pointer actions — it has intermittently
  // closed mid-click ("not visible"/"not stable") or had Playwright's
  // scroll-into-view step trigger a sticky header to intercept the pointer
  // ("logo-box ... intercepts pointer events"). A raw DOM click skips
  // scrolling and hover/interception checks entirely.
  const option = page.getByText(presetLabel, { exact: true }).first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.evaluate((el) => el.click());
}

async function selectYesterday(page) {
  return selectDatePreset(page, 'เมื่อวาน');
}

// Selects the "this month" (month-to-date) range. Unlike the flat presets
// handled by selectDatePreset, "ภายในเดือน" (within month) is a submenu that
// only reveals its month grid on HOVER — a plain click doesn't open it. Once
// revealed, the current month is the cell Shopee marks orange with the class
// `eds-month-table__col current`; clicking it applies immediately (the range
// trigger then reads e.g. "2026.07"). Text-based/class-based selectors since
// Shopee's DOM has no stable IDs here — first place to fix if labels change.
async function selectThisMonth(page) {
  const rangeTrigger = page.locator('span.value').first();
  await rangeTrigger.waitFor({ state: 'visible', timeout: 30000 });
  await humanPause();
  await rangeTrigger.click();
  await humanPause();

  const withinMonth = page.getByText('ภายในเดือน', { exact: true }).first();
  await withinMonth.waitFor({ state: 'visible', timeout: 10000 });
  await withinMonth.hover();
  await humanPause();

  // The current month is the orange cell Shopee tags with `.current`. Real
  // click works here (verified) since the grid is already open from the
  // hover above; fall back to a raw DOM click if a pointer action is
  // intercepted (sticky header) or the flyout is momentarily unstable.
  const currentMonth = page.locator('div.eds-month-table__col.current').first();
  await currentMonth.waitFor({ state: 'visible', timeout: 10000 });
  try {
    await currentMonth.click();
  } catch (err) {
    await currentMonth.evaluate((el) => el.click());
  }
  await humanPause();
}

// Shopee occasionally shows a re-verification modal ("เพื่อความปลอดภัยของ
// บัญชีคุณ กรุณาใส่รหัสผ่าน...") on certain pages even with a valid saved
// session — fill it in from SHOPEE_PASSWORD and confirm if it appears, no-op
// otherwise. Does NOT log the password anywhere.
async function handleSecurityVerification(page) {
  const passwordInput = page.getByPlaceholder('รหัสผ่าน').first();
  const visible = await passwordInput.isVisible().catch(() => false);
  if (!visible) return false;

  const password = process.env.SHOPEE_PASSWORD;
  if (!password) {
    throw new Error('Security verification prompt appeared but SHOPEE_PASSWORD is not set in .env');
  }

  await passwordInput.fill(password);
  await page.getByText('ตรวจสอบ', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  return true;
}

// Polls (rather than a single fixed wait) for whichever comes first: the
// security-verification modal, the onboarding tooltip, or the real page
// content (span.value). isVisible() itself doesn't wait, so a single check
// right after navigation can miss a modal that renders a moment later —
// this loop keeps checking every 300ms, handling obstacles as they appear,
// until the page is actually usable or maxWaitMs runs out.
async function waitUntilPageReady(page, { maxWaitMs = 30000 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await handleSecurityVerification(page)) continue;

    const skipButton = page.getByText('ข้าม', { exact: true }).first();
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
      continue;
    }

    if (await page.locator('span.value').first().isVisible().catch(() => false)) {
      return true;
    }

    await page.waitForTimeout(300);
  }
  return false;
}

async function clickDownload(page) {
  const downloadButton = page.getByText('ดาวน์โหลดข้อมูล', { exact: true }).first();
  await downloadButton.waitFor({ state: 'visible', timeout: 15000 });
  await humanPause();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    downloadButton.click(),
  ]);
  return download;
}

async function exportYesterdayReport(page, { shopName, outputDir }) {
  const targetDir = outputDir || DOWNLOAD_DIR;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  await humanPause();
  // Handles the occasional "เพื่อความปลอดภัยของบัญชีคุณ..." re-verification
  // modal that can appear on this page even with a valid session — without
  // this, selectYesterday's wait for span.value times out since the modal
  // blocks it. (Already relied on by the all-products flow; shop-stats just
  // never called it.)
  await waitUntilPageReady(page);
  await selectYesterday(page);
  const download = await clickDownload(page);

  const dateStr = yesterdayYYYYMMDD();
  const filename = reportFilename(shopName, dateStr, dateStr);
  const savePath = path.join(targetDir, filename);
  await download.saveAs(savePath);

  return savePath;
}

// Exports the "this month" (month-to-date) report for the current shop.
async function exportThisMonthReport(page, { shopName, outputDir }) {
  const targetDir = outputDir || DOWNLOAD_DIR;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  await humanPause();
  await waitUntilPageReady(page);
  await selectThisMonth(page);
  const download = await clickDownload(page);

  const filename = reportFilename(shopName, firstOfMonthYYYYMMDD(), yesterdayYYYYMMDD());
  const savePath = path.join(targetDir, filename);
  await download.saveAs(savePath);

  return savePath;
}

module.exports = {
  exportYesterdayReport,
  exportThisMonthReport,
  DOWNLOAD_DIR,
  selectYesterday,
  selectThisMonth,
  selectDatePreset,
  clickDownload,
  yesterdayYYYYMMDD,
  daysAgoYYYYMMDD,
  firstOfMonthYYYYMMDD,
  brandFor,
  reportFilename,
  handleSecurityVerification,
  waitUntilPageReady,
  humanPause,
};
