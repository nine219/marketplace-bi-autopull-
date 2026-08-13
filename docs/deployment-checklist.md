# Deployment Checklist

Steps to move this project from a dev machine to a new server and get the
daily pull running there.

## 1. Copy files to the server

Copy the whole project folder **except** these (they're regenerated or
machine-specific, see `.gitignore`):

- `node_modules/`
- `downloads/` (optional — only bring it if you want to keep history)
- `logs/` (auto-created on first run)

Bring these even though `.gitignore` excludes them from source control:

- `.env` — not in git; create fresh on the server (step 3)
- `storage/` — Playwright login sessions (`chrome-profile`,
  `lazada-chrome-profile`). Copy these over so the server doesn't need a
  fresh interactive login on day one.

- [ ] `src/` copied
- [ ] `package.json`, `package-lock.json` copied
- [ ] `products.json` copied
- [ ] `storage/` copied (chrome-profile + lazada-chrome-profile)
- [ ] `downloads/` copied, if keeping history

## 2. Install dependencies

```bash
npm ci
```

Installs `dotenv` and `playwright` from `package-lock.json` in one shot
(no need to `npm install` each package individually).

Then install the actual browser binary Playwright drives (npm ci only
installs the JS library, not Chromium itself):

```bash
# Windows
npx playwright install chromium

# Linux — also installs the OS-level libraries Chromium needs
npx playwright install --with-deps chromium
```

- [ ] `npm ci` completed without errors
- [ ] `npx playwright install [--with-deps] chromium` completed

## 3. Configure `.env`

Copy `.env.example` to `.env` and fill in real values:

- [ ] `SHOP_NAME`, `HEADLESS=true`
- [ ] `SHOPEE_ACCOUNT_NAME`, `SHOPEE_PASSWORD`
- [ ] `LAZADA_MIZUMI_EMAIL` / `LAZADA_MIZUMI_PASSWORD`
- [ ] `LAZADA_BOMI_EMAIL` / `LAZADA_BOMI_PASSWORD`
- [ ] `LAZADA_GC_EMAIL` / `LAZADA_GC_PASSWORD`
- [ ] `client_id`, `tenant_id`, `client_secret` (Azure AD app for SharePoint
      upload — needs `Files.ReadWrite.All` or `Sites.ReadWrite.All`
      application permission, admin-consented)

## 4. Verify login sessions still work

Sessions in `storage/` can expire. Confirm each still works, or re-login
if needed:

```bash
node src/login.js          # Shopee — opens a headed window if session expired
node src/lazada/login.js   # Lazada
```

These need a headed browser (a visible window) to handle OTP/CAPTCHA, so
the server needs RDP/VNC access the first time, or you re-login on this
machine and re-copy `storage/` afterward.

- [ ] Shopee session confirmed valid
- [ ] Lazada session confirmed valid (per account: mizumi, bomi, gc)

## 5. Do a manual test run

```bash
npm run pull:all
```

Watch for:
- [ ] Shopee reports downloaded to `downloads/<date>/<shop>/`
- [ ] Lazada reports downloaded to `downloads/<date>/lazada/<account>/`
- [ ] SharePoint upload succeeds (`npm run upload:sharepoint` if it's a
      separate step in your flow)
- [ ] No `SessionExpiredError` in the output

## 6. Schedule the daily run

`runDaily.js` wraps `pullAll.js`, capturing output to `logs/<date>.log`
and appending a one-line result to `logs/summary.log`.

**Windows (Task Scheduler):**
- [ ] Action: `node.exe`, arguments: `src/runDaily.js`, start-in: project
      root folder
- [ ] Trigger: daily, at the desired time
- [ ] "Run whether user is logged on or not" if server has no persistent
      login session

**Linux (cron):**
```
0 6 * * * cd /path/to/shopee-bi-autopull && node src/runDaily.js
```
- [ ] Crontab entry added
- [ ] `node` is on `PATH` for the cron user (cron runs a minimal
      environment — use the full path to `node` if `which node` isn't
      picked up, e.g. `/usr/bin/node`)

## 7. Post-deploy checks

- [ ] First scheduled run completed — check `logs/summary.log` for
      `SUCCESS`
- [ ] Confirm Node.js version on the server matches what was used in dev
      (no `engines` field is pinned in `package.json` currently — check
      with `node -v` on both machines if anything behaves differently)
- [ ] Confirm disk space / cleanup plan for `downloads/` and `logs/`,
      since neither is pruned automatically
