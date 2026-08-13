const BI_URL = 'https://seller.shopee.co.th/datacenter/overview';
const PORTAL_URL = 'https://seller.shopee.co.th/portal/shop';
const LOGIN_HOST_PATTERNS = [/accounts\.shopee\.co\.th/, /account\.seller\.shopee\.com/];
const ACCOUNT_NAME = process.env.SHOPEE_ACCOUNT_NAME || 'MizuMi:Namwarn';

class SessionExpiredError extends Error {}

// Navigates to the shop-picker page using the current context's saved
// session (shop-agnostic, so it works before any shop has been selected).
// If Shopee redirects to a login page (session expired), and the browser is
// headed, waits for a human to log in right there in the open window
// (including OTP) instead of just failing — no need to stop and re-run
// "node src/login.js" separately. In headless mode there's no window for a
// human to use, so it throws SessionExpiredError immediately instead.
async function ensureLoggedIn(context, { headless } = {}) {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });
  // Shopee redirects an unauthenticated session to the login host with a
  // CLIENT-SIDE redirect that fires after domcontentloaded — checking the URL
  // right away would wrongly see the portal URL and think we're logged in.
  // Let the page settle (and any redirect complete) before deciding.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const onLoginPage = () => LOGIN_HOST_PATTERNS.some((pattern) => pattern.test(page.url()));
  if (onLoginPage()) {
    if (headless) {
      throw new SessionExpiredError(
        `Not logged in — redirected to ${page.url()}. Run with HEADLESS=false so you can log in, or run "node src/login.js" first.`
      );
    }

    console.log('Session expired — auto-clicking through the login form; you only need to handle OTP/CAPTCHA if asked.');
    console.log('Waiting for login to finish...');
    const deadline = Date.now() + 5 * 60 * 1000; // 5 minutes to complete login
    let passwordSubmitted = false;
    while (onLoginPage()) {
      if (Date.now() > deadline) {
        throw new SessionExpiredError('Timed out waiting for login.');
      }

      // Initial login page — click "Login with Main/Sub Account" so the
      // human doesn't have to, landing them straight on the sub-account
      // login form.
      const mainAccountLink = page.getByText('Login with Main/Sub Account', { exact: false }).first();
      if (await mainAccountLink.isVisible().catch(() => false)) {
        await mainAccountLink.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // "เลือกบัญชีผู้ใช้" (choose user account) screen — Shopee shows this
      // after clicking "Login with Main/Sub Account" when it remembers a
      // previously-used account. Auto-click it so the human only has to
      // handle password/OTP, not this extra pick step.
      const accountOption = page.getByText(ACCOUNT_NAME, { exact: true }).first();
      if (await accountOption.isVisible().catch(() => false)) {
        await accountOption.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Password form — auto-fill the password from .env and submit once, so
      // the human doesn't have to type it. OTP/CAPTCHA (if Shopee asks) still
      // needs a human, and the loop keeps waiting until we leave the login page.
      const password = process.env.SHOPEE_PASSWORD;
      if (password && !passwordSubmitted) {
        const passwordField = page.locator('input[type="password"]').first();
        if (await passwordField.isVisible().catch(() => false)) {
          await passwordField.fill(password).catch(() => {});
          const loginButton = page
            .getByRole('button', { name: /log ?in|เข้าสู่ระบบ|sign ?in/i })
            .first();
          if (await loginButton.isVisible().catch(() => false)) {
            await loginButton.click().catch(() => {});
          } else {
            await passwordField.press('Enter').catch(() => {});
          }
          passwordSubmitted = true;
          console.log('Submitted password — handle OTP/CAPTCHA in the window if prompted.');
        }
      }

      await page.waitForTimeout(1000);
    }
    console.log('Logged in — continuing.');
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });
  }

  return page;
}

// Standalone manual-login helper: run with `node src/login.js`.
// Opens a headed browser against the persisted profile so a human can log in
// (including OTP/CAPTCHA). The session is saved automatically in
// storage/chrome-profile since the context is persistent — just close the
// browser window once logged in and looking at the Business Insights page.
async function manualLogin() {
  const { openContext } = require('./browserContext');
  const context = await openContext({ headless: false });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

  console.log('If you are not logged in, log in now (including OTP).');
  console.log('Once you see the shop list page, close the browser window to finish.');

  await new Promise((resolve) => context.on('close', resolve));
  console.log('Session saved. You can now run: node src/index.js');
}

if (require.main === module) {
  manualLogin().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { ensureLoggedIn, SessionExpiredError, BI_URL, PORTAL_URL };
