const path = require('path');
const { yesterdayCompact, currentMonthRange } = require('./dates');
const { DOWNLOAD_DIR, reportFilename, clickExportAndDownload, ensureDir, humanPause } = require('./exportCommon');

const DASHBOARD_URL = 'https://sellercenter.lazada.co.th/ba/dashboard';

function dashboardMonthUrl(startDash, endDash) {
  return `${DASHBOARD_URL}?dateRange=${startDash}%7C${endDash}&dateType=month`;
}

// Default dashboard view is "เมื่อวาน" (yesterday) — verified live.
async function exportDashboardYesterday(page, { accountKey, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  ensureDir(targetDir);

  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await humanPause();

  const download = await clickExportAndDownload(page);
  const dateStr = yesterdayCompact();
  const savePath = path.join(targetDir, reportFilename('dashboard', accountKey, dateStr, dateStr));
  await download.saveAs(savePath);
  return savePath;
}

// Current month-to-date — Lazada auto-clips the displayed range to "up to
// yesterday" (the last complete day) even though the URL's end date is the
// full calendar month end (verified live: URL asked for
// 2026-07-01|2026-07-31, page showed data through 07-29 with today being
// 07-30). Filename end date matches yesterday for the same reason, and for
// consistency with the Shopee pipeline's month-file convention.
async function exportDashboardThisMonth(page, { accountKey, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  ensureDir(targetDir);

  const { start, end } = currentMonthRange();
  await page.goto(dashboardMonthUrl(start, end), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await humanPause();

  const download = await clickExportAndDownload(page);
  const startCompact = start.replace(/-/g, '');
  const savePath = path.join(targetDir, reportFilename('dashboard', accountKey, startCompact, yesterdayCompact()));
  await download.saveAs(savePath);
  return savePath;
}

module.exports = { exportDashboardYesterday, exportDashboardThisMonth, DASHBOARD_URL };
