const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const USER_DATA_DIR = path.join(__dirname, '..', 'storage', 'chrome-profile');

async function openContext({ headless } = {}) {
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: headless ?? true,
    acceptDownloads: true,
  });
}

module.exports = { openContext, USER_DATA_DIR };
