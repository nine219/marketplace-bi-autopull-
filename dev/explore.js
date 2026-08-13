// Throwaway exploration script — NOT part of the final automation.
// Opens a real, visible browser so a human can log in manually (OTP/CAPTCHA)
// and click through to Business Insights export. Logs network calls and
// download events that look relevant, so we can find the real selectors
// / endpoints before writing the final Playwright script.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'explore-log.txt');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const USER_DATA_DIR = path.join(__dirname, 'storage', 'chrome-profile');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + '\n');
}

const INTERESTING = /export|download|datacenter|report|excel|xlsx|shop-stats|business.?insight/i;

(async () => {
  fs.writeFileSync(LOG_FILE, '');
  log('Launching browser...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    acceptDownloads: true,
  });
  const page = context.pages()[0] || (await context.newPage());

  page.on('request', (req) => {
    if (INTERESTING.test(req.url())) {
      log(`REQUEST ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', (res) => {
    if (INTERESTING.test(res.url())) {
      log(`RESPONSE ${res.status()} ${res.url()}`);
    }
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      log(`NAVIGATED ${frame.url()}`);
    }
  });

  page.on('download', async (download) => {
    const suggested = download.suggestedFilename();
    const savePath = path.join(DOWNLOAD_DIR, suggested);
    await download.saveAs(savePath);
    log(`DOWNLOAD suggestedFilename="${suggested}" url="${download.url()}" savedTo="${savePath}"`);
  });

  log('Navigating to Shopee seller login...');
  await page.goto('https://accounts.shopee.co.th/seller/login');

  log('READY. Please, in the opened browser window:');
  log('  1. Click "Login with Main/Sub Account" and log in manually (OTP/CAPTCHA as needed).');
  log('  2. Select the shop (e.g. Gentle Colors) from the shop picker.');
  log('  3. Navigate to Business Insights (datacenter/overview) if not already there.');
  log('  4. Set the date range you want (e.g. yesterday).');
  log('  5. Click the download/export button and let the file download.');
  log('  6. When done, just close the browser window — this script will exit.');
  log(`Watching for events matching: ${INTERESTING}`);
  log(`Log file: ${LOG_FILE}`);
  log(`Downloads will be saved to: ${DOWNLOAD_DIR}`);

  await new Promise((resolve) => {
    context.on('close', resolve);
  });

  log('Browser closed. Exiting.');
})();
