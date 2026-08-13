const path = require('path');
const { todayCompact } = require('./dates');
const { DOWNLOAD_DIR, reportFilename, clickExportAndDownload, ensureDir, humanPause } = require('./exportCommon');

const PROMOTION_URL = 'https://sellercenter.lazada.co.th/ba/promotion/campaign';

// No date-range picker on this page — it's a flat list of recent campaigns
// ("Only campaigns from the past 13 months will be displayed", per the page
// itself), so this is a point-in-time snapshot rather than a date-scoped
// report. Filename uses today's date for both start/end to reflect that.
async function exportPromotionCampaigns(page, { accountKey, outputDir }) {
  const targetDir = outputDir || path.join(DOWNLOAD_DIR, accountKey.toLowerCase());
  ensureDir(targetDir);

  await page.goto(PROMOTION_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await humanPause();

  const download = await clickExportAndDownload(page);
  const dateStr = todayCompact();
  const savePath = path.join(targetDir, reportFilename('promotion', accountKey, dateStr, dateStr));
  await download.saveAs(savePath);
  return savePath;
}

module.exports = { exportPromotionCampaigns, PROMOTION_URL };
