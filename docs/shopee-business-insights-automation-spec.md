# Shopee Business Insights Auto-Download

## เป้าหมาย
เดิมต้องเข้า Shopee Seller Centre → Business Insights ด้วยมือทุกวันเพื่อดาวน์โหลดไฟล์รายงาน (.xlsx) — ทั้งยอดขายร้าน ("Shop Performance"), ข้อมูลสินค้าทั้งหมด ("All Products"), และข้อมูลรายสินค้า ("Product Detail") ระบบนี้ทำให้ขั้นตอนดังกล่าวเป็นอัตโนมัติ ด้วย Playwright browser automation

## เหตุผลที่เลือก Browser Automation แทน Open API
| แนวทาง | ใช้ได้กับข้อมูลนี้ไหม |
|---|---|
| Shopee Open API v2 (Order API) | ได้เฉพาะยอดขาย/คำสั่งซื้อ ไม่ตรง 100% กับตัวเลขในหน้า BI |
| Shopee Open API v2 (Traffic/Analytics) | ไม่มี endpoint สำหรับคลิก/ผู้เยี่ยมชม/conversion/traffic source |
| **Browser Automation (Playwright)** | ได้ครบทุกข้อมูล เพราะจำลองสิ่งที่มือทำอยู่แล้ว — แนวทางที่ใช้จริง |

## สถานะ: Upload เข้า SharePoint
**ทำแล้ว** — IT สร้าง Azure AD App Registration ให้ (App-only / client credentials flow) พร้อม Microsoft Graph permission `Files.ReadWrite.All` (admin-consented) ดูรายละเอียดในหัวข้อ "8. Upload เข้า SharePoint" ด้านล่าง

---

## สิ่งที่ implement แล้ว

Stack: **Node.js + Playwright** (persistent browser profile, ไม่ใช้ Python)

### 1. Login (`src/login.js`, `src/browserContext.js`)
- ใช้ `chromium.launchPersistentContext()` เก็บ session ไว้ที่ `storage/chrome-profile/` (ไม่ใช่ `storageState()` JSON ตามแผนเดิม — persistent profile ทำให้ cookie/session อยู่ข้าม run โดยไม่ต้อง export/import เอง)
- `ensureLoggedIn()`: เช็คว่าถูก redirect ไปหน้า login หรือไม่ (รอ `networkidle` ก่อนเช็ค เพราะ Shopee redirect ด้วย client-side JS หลัง `domcontentloaded`)
- ถ้า session หมดอายุและรันแบบ headed (`HEADLESS=false`): auto-click "Login with Main/Sub Account" → auto-select บัญชีที่จำไว้ (`SHOPEE_ACCOUNT_NAME`) → auto-fill รหัสผ่านจาก `SHOPEE_PASSWORD` ใน `.env` → เหลือแค่ OTP/CAPTCHA ให้คนกดเอง
- ถ้ารันแบบ headless และ session หมดอายุ: throw `SessionExpiredError` ทันที (ไม่มีหน้าต่างให้คนล็อกอิน)
- รันแยกเดี่ยวได้ด้วย `npm run login` (เปิดหน้าต่างเปล่าให้ล็อกอินมือ ปิดหน้าต่างเพื่อ save session)

### 2. Shop-level report — "Shop Performance" (`src/exportReport.js`, `src/index.js`)
- Export **2 ไฟล์ต่อร้าน**: เมื่อวาน (`เมื่อวาน` preset) และ เดือนนี้ (month-to-date)
- เดือนนี้ (`selectThisMonth`): dropdown ช่วงวันที่ → **hover** (ไม่ใช่คลิก) ที่ "ภายในเดือน" เพื่อเปิด month grid → คลิกเซลล์เดือนปัจจุบัน (สีส้ม, class `eds-month-table__col.current`)
- Export แบบ instant download (`page.waitForEvent('download')`) ไม่ผ่านคิว
- รันได้ด้วย `npm run pull` (ทุกร้านใน `SHOP_NAMES`)

### 3. All-products report — "Product Performance" (`src/exportAllProducts.js`, `src/indexAllProducts.js`)
- Export **2 ไฟล์ต่อร้าน** เช่นกัน: เมื่อวาน + เดือนนี้
- Export ผ่านระบบคิวของ Shopee ("Download Center" flyout, `.shopee-export-button`) — กดดาวน์โหลดแล้วต้องรอสถานะ "กำลังดำเนินการ" → "ดาวน์โหลด" ก่อนถึงจะกดโหลดไฟล์จริงได้
- **จุดที่ต้องระวัง (bug ที่เจอและแก้แล้ว):** แถวที่เพิ่ง queue ใหม่จะถูก prepend ไว้บนสุดของ list เสมอ ต้อง poll เฉพาะแถวบนสุดที่มีชื่อไฟล์ (`.list-item` ที่มี `.xlsx`, ข้ามแถว header) — ถ้า poll แบบกวาดทั้งหน้าจะไปเจอแถวเก่าที่พร้อมโหลดอยู่แล้วก่อน แล้วโหลดไฟล์ผิด (ข้อมูลเก่า/คนละช่วงวันที่) แทนที่จะรอไฟล์ที่เพิ่งขอจริง
- รันได้ด้วย `npm run pull:products`

### 4. Single-product report — "Product Detail" (`src/exportProduct.js`, `src/indexProduct.js`)
- Export ข้อมูลย้อนหลัง 7 วันของสินค้ารายตัว (ไม่มี preset "เมื่อวาน" แบบวันเดียวในหน้านี้)
- อ่านรายการสินค้าที่จะ export จาก `products.json` (`[{ "shop": "...", "productId": "..." }]`)
- รันได้ด้วย `npm run pull:product`

### 5. Cooldown / throttling
ทุก export คั่นด้วย delay 65 วินาที (`SHOP_COOLDOWN_MS`) — ทั้งระหว่างร้าน และระหว่างเมื่อวาน/เดือนนี้ของร้านเดียวกัน เพราะ Shopee throttle export endpoint ต่อบัญชี

### 6. รูปแบบชื่อไฟล์ (Shopee)
- Shop-level: `shop.shopee.{brand}.{start}_{end}.xlsx` เช่น `shop.shopee.mizumi.20260701_20260721.xlsx`
- All-products: `product.shopee.{brand}.{start}_{end}.xlsx`
- Single-product (ยังไม่ได้ปรับ format นี้): `{shop}_product-{productId}_{start}-{end}.xlsx`
- `{brand}` map จากชื่อร้าน: `gentlecolors`→`gentlecolors`, `bomi_supplements`→`bomi`, `mizumi_officialshop`→`mizumi` (`BRAND_BY_SHOP` ใน `src/exportReport.js`)
- วันที่ทั้งหมดคำนวณเป็นเวลา Asia/Bangkok (GMT+7) ไม่ว่าเครื่องที่รันจะตั้ง timezone อะไร

### 7. Lazada Seller Center (`src/lazada/`)
แพลตฟอร์มที่สอง แยกจาก Shopee โดยสิ้นเชิง — เอกสาร requirement เดิมชื่อไฟล์ผิดเป็น "tiktok.txt" แต่เนื้อหาจริงคือ Lazada (`sellercenter.lazada.co.th`) แก้ไขเป็น `docs/lazada.txt` + `docs/ui-lazada/` แล้ว

**ความต่างหลักจาก Shopee:** Lazada ไม่มี shop-switcher แบบ Shopee — แต่ละร้าน (MizuMi, Bomi, GC) เป็นคนละ account แยกกันโดยสิ้นเชิง ต้อง login/export/logout ครบรอบสำหรับทุกร้าน (`src/lazada/index.js` วนลูปตาม `LAZADA_ACCOUNTS` ใน `.env`, default `MIZUMI,BOMI,GC`)

- **Login** (`src/lazada/login.js`): ต้องเข้า `/apps/seller/login?login=1` ตรงๆ (ไม่ใช่ path เปล่า ซึ่ง redirect ไปหน้าสมัครสมาชิกแทน) fields คือ `#account` / `#password` — ปุ่ม login มี spinner ค้างระหว่างส่ง request ต้อง poll รอ URL เปลี่ยนแทนที่จะเช็คครั้งเดียว มี `npm run login:lazada` สำหรับ login มือ (รวมถึงตอนเจอ CAPTCHA — **ห้ามเขียนโค้ดแก้ CAPTCHA เอง**)
- **Logout**: icon `#right-bar-profile` (class `icon-layout-logout`) มุมขวาล่างของหน้า
- **รายงาน 3 ประเภท ต่อร้าน (รวม 5 ไฟล์/ร้าน):**
  1. `/ba/dashboard` — default = เมื่อวาน, และ `?dateRange=...&dateType=month` = เดือนนี้ (auto-clip ถึงเมื่อวาน)
  2. `/ba/product/performance` — default = เมื่อวาน, ส่วน `?dateType=month&dateRange=...` **ต้องใช้เดือนที่แล้วเท่านั้น** (เดือนปัจจุบันจะขึ้น "ไม่มีข้อมูล" เพราะยังไม่ปิดเดือน)
  3. `/ba/promotion/campaign` — export ตรง ไม่มีการเลือกช่วงวันที่ (list แคมเปญย้อนหลัง 13 เดือน)
- **กดปุ่ม "นำข้อมูลออก" แล้วไม่โหลดทันที** — จะมี modal ยืนยันช่วงวันที่ก่อน ต้องกด "Ok" ถึงจะเริ่มดาวน์โหลดจริง (`clickExportAndDownload` ใน `exportCommon.js`)
- **จุดที่ต้องระวัง:** หน้า product/performance เจอโหลดค้าง (เนื้อหาว่างเปล่า ไม่มีปุ่ม export) เป็นระยะๆ กับหลายบัญชี — แก้ด้วยการ reload 1 ครั้งถ้าปุ่ม export ไม่ขึ้นภายใน 20 วิ (`gotoProductPerformance` ใน `exportProductPerformance.js`)
- **รูปแบบไฟล์ที่ดาวน์โหลดจริงคือ .xls (binary/OLE2) ไม่ใช่ .xlsx** แม้จะดูเหมือนสมัยใหม่ — เคยเซฟผิดเป็น `.xlsx` มาก่อนทำให้เปิดไม่ได้ ตอนนี้แก้แล้วให้ใช้ `.xls`
- ชื่อไฟล์: `{type}.lazada.{brand}.{start}_{end}.xls` เช่น `dashboard.lazada.mizumi.20260701_20260729.xls` (`type` ∈ dashboard/product/promotion, `brand`: MIZUMI→mizumi, BOMI→bomi, GC→gc)
- รันได้ด้วย `npm run pull:lazada`

### 8. โฟลเดอร์วันที่ (`src/dateFolder.js`)
ทุก pull pipeline (Shopee ทั้งหมด + Lazada) เซฟไฟล์ลง `downloads/{YYYY-MM-DD}/...` โดย `{YYYY-MM-DD}` คือวันที่รัน (Asia/Bangkok) — คำนวณครั้งเดียวตอนโหลดโมดูล ผ่าน `todayDateFolder()` ใน `src/dateFolder.js` ที่ export/lazada ทุกไฟล์ import ใช้ร่วมกัน (`DOWNLOAD_DIR` ใน `exportReport.js` และ `lazada/exportCommon.js`) เพื่อให้ path ตรงกันทั้งระบบ ไฟล์เก่าก่อนเปลี่ยนแปลงนี้ (ก่อน 2026-08-06) ยังอยู่ตำแหน่งเดิม **ไม่ได้ย้ายเข้าโฟลเดอร์วันที่ย้อนหลัง**

### 9. Upload เข้า SharePoint (`src/sharepoint.js`, `src/uploadToSharePoint.js`)
- Auth แบบ **App-only (client credentials)** ผ่าน Azure AD App Registration — ใช้ `client_id` / `tenant_id` / `client_secret` ใน `.env`, ขอ token จาก `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token` scope `https://graph.microsoft.com/.default`
- ต้องมี Microsoft Graph application permission `Files.ReadWrite.All` (หรือ `Sites.ReadWrite.All`) แบบ admin-consented — **ยืนยันแล้วว่าใช้งานได้จริง** (IT อนุมัติแล้ว)
- Site: `mizuhadagroup.sharepoint.com/sites/Shopeesellercenter`, drive/document library: "เอกสาร" (Shared Documents) — resolve ผ่าน Graph `/sites/{host}:{path}` แล้ว `/sites/{id}/drives`
- `uploadToSharePoint.js` สแกนเฉพาะ `downloads/{TARGET_DATE}/` (default = วันนี้, override ได้ด้วย `UPLOAD_DATE=2026-08-05 npm run upload:sharepoint` เพื่ออัปโหลดวันย้อนหลัง) แล้วจัดเข้าโฟลเดอร์ตามหมวด (`mapToRemoteFolder`):
  ```
  Shared Documents/Data/{YYYY-MM-DD}/
    Shop/
      Shopee/{shop}/...        <- shop.shopee.*.xlsx
      Lazada/{account}/...     <- dashboard.lazada.*.xls
    Product/
      Shopee/{shop}/...        <- product.shopee.*.xlsx + per-product report
      Lazada/{account}/...     <- product.lazada.*.xls **และ** promotion.lazada.*.xls (รวมกัน — promotion ไม่แยกหมวดของตัวเอง)
  ```
  แยกหมวดจาก path/ชื่อไฟล์ (relative ต่อ `downloads/{date}/`): platform ดูจากโฟลเดอร์ local top-level (`lazada/` → Lazada, อื่นๆ → Shopee); category (`Shop` vs `Product`) ของ Lazada ดูจาก prefix ชื่อไฟล์ (`dashboard.` → Shop, อื่นๆ → Product), ของ Shopee ดูจากโฟลเดอร์ local top-level (`product/` → Product, อื่นๆ → Shop) — เขียนทับไฟล์ชื่อซ้ำอัตโนมัติ (PUT `/content`)
- ถ้ายังไม่มีไฟล์ใน `downloads/{date}/` เลย (เช่น ยังไม่ได้รัน pull วันนั้น) จะแจ้งเฉยๆ ว่าไม่มีอะไรให้อัป ไม่ error
- ใช้ simple PUT upload (พอสำหรับไฟล์ <4MB — รายงานที่มีตอนนี้ใหญ่สุดไม่ถึง 500KB) ถ้าไฟล์ใหญ่กว่านี้ในอนาคตต้องเปลี่ยนไปใช้ upload session
- รันได้ด้วย `npm run upload:sharepoint` เดี่ยวๆ หรือรวมเป็นขั้นตอนสุดท้ายของ `npm run pull:all` (ดูข้อ 10)

### 10. คำสั่งรวมรายวัน (`src/pullAll.js`)
`npm run pull:all` รัน Shopee shop stats → Shopee all-products → Lazada → upload SharePoint ตามลำดับ (เป็น child process แยกทีละตัว หยุดทันทีถ้าขั้นไหน exit code ไม่ใช่ 0) ออกแบบมาให้รัน **วันละ 1 ครั้ง** ตามรูปแบบการใช้งานจริง — ไม่รวม `pull:product` (single-product) ไว้ในนี้ เพราะเป็นรายงานแยกที่ไม่ได้ export ทุกวันเป็น routine

### 11. โครงสร้างโปรเจกต์
```
src/            สคริปต์ automation ทั้งหมด (Shopee ที่ root, Lazada ใน src/lazada/)
docs/           เอกสารอ้างอิง (ไฟล์นี้, docs/ui-flow/, docs/lazada.txt + docs/ui-lazada/)
dev/            เครื่องมือ exploration ที่ไม่ใช่ automation จริง (ไม่ต้องดูก็ได้)
downloads/      ไฟล์รายงานที่ export ได้ (gitignored) — แยกโฟลเดอร์ตามวันที่รัน `downloads/{YYYY-MM-DD}/...`
storage/        Chrome persistent profile เก็บ session (gitignored) — แยกกันคนละโฟลเดอร์ระหว่าง Shopee/Lazada
products.json   รายการสินค้าที่จะ export แบบรายตัว (Shopee)
.env            เก็บ credentials ทั้งหมด: Shopee, Lazada (3 บัญชี), Azure AD app (gitignored)
```

## ยังไม่ทำ (พักไว้)
- Scheduling อัตโนมัติ (cron / Task Scheduler) — ตอนนี้ยังเป็น manual trigger (`npm run pull:all`) สำหรับรันวันละครั้ง
- Error handling / monitoring / alerting เมื่อ export หรือ upload ล้มเหลว
- รวม naming convention ของ single-product report (Shopee) ให้ตรงกับอีก 2 แบบ
- ย้ายไฟล์เก่าก่อน 2026-08-06 (ที่ยังไม่มีโฟลเดอร์วันที่) เข้าโครงสร้างใหม่ ถ้าต้องการ

## ความเสี่ยงที่ต้องรับทราบ
- Selector ส่วนใหญ่อิง text ภาษาไทย/class name ที่ไม่มี id คงที่ (ทั้ง Shopee และ Lazada เป็น SPA, class เป็น scoped hash) — ถ้าแพลตฟอร์มเปลี่ยน UI มีโอกาสพังสูง ต้อง maintain เป็นระยะ
- Class name ทั่วไปอย่าง `.list-item` อาจตรงกับ element อื่นในหน้าที่ไม่เกี่ยวข้อง — ต้อง scope ผ่าน parent class ที่เจาะจงเสมอ (บทเรียนจากบั๊กใน Shopee all-products export)
- มีความเสี่ยงบัญชีถูกระบบตรวจจับว่าใช้ bot — มี `humanPause()` สุ่ม delay ระหว่างคลิกอยู่แล้ว แต่ควร throttle การรัน (วันละครั้งพอ) — **Lazada เจอ CAPTCHA จริงมาแล้วหลังทดสอบ login ซ้ำๆ ถี่เกินไปในช่วงเวลาสั้นๆ** ไม่ควรรันซ้ำติดกันหลายรอบโดยไม่เว้นระยะ
- Session ใน `storage/chrome-profile` (Shopee) อาจหมดอายุ — ถ้ารันแบบ `HEADLESS=false` จะ auto-login ได้เกือบทั้งหมด (เหลือ OTP/CAPTCHA), ถ้ารันแบบ headless จะ fail ทันทีเมื่อ session หมดอายุและต้องมีคนมา `npm run login` ใหม่
- Lazada **ไม่ persist session ข้าม process** แม้ใช้ persistent profile เดียวกัน (ยืนยันแล้วจากการทดสอบจริง) — ทุกรอบรันต้อง login ใหม่เสมอทั้ง 3 บัญชี ไม่ใช่ bug ที่ต้องแก้ เป็นข้อจำกัดของแพลตฟอร์ม
- Client secret ของ Azure AD app มีวันหมดอายุ (ตั้งไว้ตอนสร้างใน Azure Portal) — ต้องจำไว้ว่าจะหมดอายุเมื่อไหร่แล้วไป renew ก่อน ไม่งั้น `upload:sharepoint` จะ fail ทันที
