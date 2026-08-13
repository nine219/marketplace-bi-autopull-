const LOGIN_URL = 'https://sellercenter.lazada.co.th/apps/seller/login?login=1';
const HOME_URL = 'https://sellercenter.lazada.co.th/';
const LOGIN_HOST_PATTERN = /\/apps\/seller\/login/;

class SessionExpiredError extends Error {}

function isOnLoginPage(page) {
  return LOGIN_HOST_PATTERN.test(page.url());
}

// Logs into Lazada Seller Center with one account's credentials. Unlike
// Shopee (single login, switch between shops), each Lazada shop is a fully
// separate account — every shop needs its own full login/export/logout
// cycle. Navigating straight to LOGIN_URL is required: the bare seller
// center root redirects to a REGISTER form (with a confirmPassword field)
// rather than login when signed out, not the sign-in form.
async function login(page, { email, password }) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const hasConfirmPassword = await page
    .locator('#confirmPassword')
    .isVisible()
    .catch(() => false);
  if (hasConfirmPassword) {
    throw new Error(`Landed on the register form instead of login — URL: ${page.url()}`);
  }

  const accountField = page.locator('#account');
  await accountField.waitFor({ state: 'visible', timeout: 15000 });
  await accountField.fill(email);
  await page.locator('#password').fill(password);

  const loginBtn = page.getByRole('button', { name: /เข้าสู่ระบบ/ }).first();
  await loginBtn.click();

  // The button shows an inline loading spinner while the login request is
  // in flight — polling for URL change (rather than a single networkidle
  // wait right after click) avoids checking before the request completes,
  // which otherwise looks identical to a rejected login.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && isOnLoginPage(page)) {
    await page.waitForTimeout(1000);
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  if (isOnLoginPage(page)) {
    throw new SessionExpiredError(`Still on login page after submit — check credentials or for OTP/CAPTCHA. URL: ${page.url()}`);
  }
}

// Logout icon: bottom of the right-hand icon rail present on every
// dashboard/report page (verified in docs/ui-lazada/2-logout-icon.png) — id
// "right-bar-profile", containing an <i class="icon-layout-logout"> glyph.
async function logout(page) {
  const logoutIcon = page.locator('#right-bar-profile');
  await logoutIcon.waitFor({ state: 'visible', timeout: 15000 });
  await logoutIcon.click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function ensureLoggedIn(page, credentials) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (isOnLoginPage(page)) {
    await login(page, credentials);
  }
}

// Standalone manual-login helper: run with `node src/lazada/login.js`.
// Opens a headed browser against the persistent profile so a human can log
// in (including CAPTCHA, which the automated flow must never attempt to
// solve) — just close the browser window once logged in.
async function manualLogin() {
  const { openContext } = require('./browserContext');
  const context = await openContext({ headless: false });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  console.log('Log in by hand now (including any CAPTCHA/OTP).');
  console.log('Once you see the seller center home page, close the browser window to finish.');

  await new Promise((resolve) => context.on('close', resolve));
  console.log('Session saved.');
}

if (require.main === module) {
  manualLogin().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { login, logout, ensureLoggedIn, isOnLoginPage, manualLogin, SessionExpiredError, LOGIN_URL, HOME_URL };
