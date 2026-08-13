require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadFile } = require('./sharepoint');
const { todayDateFolder } = require('./dateFolder');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const REPORT_EXTENSIONS = new Set(['.xlsx', '.xls']);

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
  for (const filePath of files) {
    const relativePath = path.relative(SCAN_DIR, filePath);
    const relativeDir = path.dirname(relativePath);
    const filename = path.basename(filePath);
    const remoteFolder = mapToRemoteFolder(relativeDir === '.' ? '' : relativeDir, filename);
    try {
      const { webUrl } = await uploadFile(filePath, remoteFolder);
      console.log(`Uploaded: ${relativePath} -> ${webUrl}`);
      uploaded++;
    } catch (err) {
      console.error(`Failed: ${relativePath}: ${err.message}`);
      failed++;
    }
  }

  console.log(`Done. ${uploaded} uploaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
