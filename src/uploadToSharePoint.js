require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadFile, getFolderWebUrl } = require('./sharepoint');
const { todayDateFolder } = require('./dateFolder');
const { sendTeamsAlert } = require('./teamsAlert');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const REPORT_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

// Defaults to today, but can be overridden (e.g. UPLOAD_DATE=2026-08-05
// npm run upload:sharepoint) to re-upload a specific past day's folder.
const TARGET_DATE = process.env.UPLOAD_DATE || todayDateFolder();
const SCAN_DIR = path.join(DOWNLOADS_DIR, TARGET_DATE);

function findReportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findReportFiles(fullPath));
    } else if (REPORT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

// Maps a path (relative to downloads/{TARGET_DATE}/) to its SharePoint
// destination folder:
//   Data/{date}/Shop/Shopee/{shop}/...       <- downloads/{date}/{shop}/shop.shopee.*.xlsx
//   Data/{date}/Ads/Shopee/{shop}/...        <- downloads/{date}/{shop}/ads_*.shopee.*.csv
//   Data/{date}/Product/Shopee/{shop}/...    <- downloads/{date}/product/{shop}/(...)
//   Data/{date}/Shop/Lazada/{account}/...    <- downloads/{date}/lazada/{account}/dashboard.lazada.*.xls
//   Data/{date}/Product/Lazada/{account}/... <- downloads/{date}/lazada/{account}/product.lazada.* AND
//                                              promotion.lazada.* (both grouped under Product,
//                                              per explicit instruction — promotion isn't its
//                                              own category)
function mapToRemoteFolder(localRelDir, filename) {
  const parts = localRelDir.split(path.sep).filter(Boolean);

  if (parts[0] === 'lazada') {
    const category = filename.startsWith('dashboard.') ? 'Shop' : 'Product';
    return ['Data', TARGET_DATE, category, 'Lazada', ...parts.slice(1)].join('/');
  }
  if (parts[0] === 'product') {
    return ['Data', TARGET_DATE, 'Product', 'Shopee', ...parts.slice(1)].join('/');
  }
  if (filename.startsWith('ads_')) {
    return ['Data', TARGET_DATE, 'Ads', 'Shopee', ...parts].join('/');
  }
  return ['Data', TARGET_DATE, 'Shop', 'Shopee', ...parts].join('/');
}

async function main() {
  const files = findReportFiles(SCAN_DIR);
  console.log(`Found ${files.length} report file(s) under downloads/${TARGET_DATE}/ — uploading into Data/${TARGET_DATE}/`);
  if (files.length === 0) {
    console.log(`(Nothing to upload — run the pull scripts first, or set UPLOAD_DATE to an existing date folder.)`);
    return;
  }

  let uploaded = 0;
  let failed = 0;
  // Tracks success/fail per platform so we can send one Teams alert each
  // for Shopee and Lazada, rather than one alert for the whole upload run.
  const platformStats = { Shopee: { uploaded: 0, failed: 0 }, Lazada: { uploaded: 0, failed: 0 } };

  for (const filePath of files) {
    const relativePath = path.relative(SCAN_DIR, filePath);
    const relativeDir = path.dirname(relativePath);
    const filename = path.basename(filePath);
    const cleanRelativeDir = relativeDir === '.' ? '' : relativeDir;
    const remoteFolder = mapToRemoteFolder(cleanRelativeDir, filename);
    const platform = cleanRelativeDir.split(path.sep)[0] === 'lazada' ? 'Lazada' : 'Shopee';
    try {
      const { webUrl } = await uploadFile(filePath, remoteFolder);
      console.log(`Uploaded: ${relativePath} -> ${webUrl}`);
      uploaded++;
      platformStats[platform].uploaded++;
    } catch (err) {
      console.error(`Failed: ${relativePath}: ${err.message}`);
      failed++;
      platformStats[platform].failed++;
    }
  }

  console.log(`Done. ${uploaded} uploaded, ${failed} failed.`);

  let folderLink = '';
  try {
    folderLink = await getFolderWebUrl(`Data/${TARGET_DATE}`);
  } catch (err) {
    console.warn(`Could not look up SharePoint folder link: ${err.message}`);
  }

  for (const [platform, stats] of Object.entries(platformStats)) {
    if (stats.uploaded === 0 && stats.failed === 0) continue; // nothing pulled for this platform
    const status = stats.failed > 0 ? 'Error' : 'Success';
    await sendTeamsAlert({
      date: TARGET_DATE,
      platform,
      status,
      link: status === 'Success' ? folderLink : '',
    });
  }

  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err.message);
  // Upload crashed before per-file/per-platform tracking could run — let
  // both platforms know rather than silently failing.
  await sendTeamsAlert({ date: TARGET_DATE, platform: 'Shopee', status: 'Error', link: '' });
  await sendTeamsAlert({ date: TARGET_DATE, platform: 'Lazada', status: 'Error', link: '' });
  process.exit(1);
});
