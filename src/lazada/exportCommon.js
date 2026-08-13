const path = require('path');
const fs = require('fs');
const { todayDateFolder } = require('../dateFolder');

// Each day's run gets its own dated folder, e.g. downloads/2026-08-06/lazada/... —
// matches the dated folder structure used on the SharePoint upload side.
const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads', todayDateFolder(), 'lazada');
const PLATFORM = 'lazada';

// Brand mapping from the .env credential prefix (LAZADA_{KEY}_EMAIL/PASSWORD)
// to the short brand name used in output filenames.
const BRAND_BY_KEY = {
  MIZUMI: 'mizumi',
  BOMI: 'bomi',
  GC: 'gc',
};

function brandFor(accountKey) {
  return BRAND_BY_KEY[accountKey] || accountKey.toLowerCase();
}

// Lazada's export actually serves legacy binary Excel (.xls / OLE2 compound
// file — verified by file signature D0 CF 11 E0, not the ZIP-based
// PK.. signature real .xlsx files have), regardless of what extension the
// download's own suggested filename implies. Saving with a .xlsx extension
// on that content is what was causing "can't open" / format-mismatch
// errors in Excel — the extension must match the true format.
function reportFilename(reportType, accountKey, startYYYYMMDD, endYYYYMMDD) {
  return `${reportType}.${PLATFORM}.${brandFor(accountKey)}.${startYYYYMMDD}_${endYYYYMMDD}.xls`;
}

// Clicking "นำข้อมูลออก" (export data) opens a confirmation modal ("Confirm
// downloading all the data: {range}?") with Cancel/Ok — verified live on the
// dashboard page. The actual file only downloads after confirming Ok, so the
// download listener must be armed before that click, not the initial one.
// Defensive about the modal not appearing (e.g. on pages without a date
// range, like promotion/campaign, which may export directly) — proceeds
// straight to waiting for the download if no Ok button shows up in time.
async function clickExportAndDownload(page, { modalTimeoutMs = 5000, downloadTimeoutMs = 30000 } = {}) {
  const exportBtn = page.getByText('นำข้อมูลออก', { exact: true }).first();
  await exportBtn.waitFor({ state: 'visible', timeout: 15000 });

  const downloadPromise = page.waitForEvent('download', { timeout: downloadTimeoutMs });
  await exportBtn.click();

  // waitFor (not isVisible, which checks immediately without polling) so we
  // actually give the modal time to render before deciding it's absent.
  const okBtn = page.getByRole('button', { name: 'Ok' }).first();
  const okAppeared = await okBtn
    .waitFor({ state: 'visible', timeout: modalTimeoutMs })
    .then(() => true)
    .catch(() => false);
  if (okAppeared) {
    await okBtn.click();
  }

  return downloadPromise;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Random delay so clicks don't land at inhuman, perfectly regular intervals.
function humanPause(minMs = 500, maxMs = 1200) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { DOWNLOAD_DIR, brandFor, reportFilename, clickExportAndDownload, ensureDir, humanPause };
