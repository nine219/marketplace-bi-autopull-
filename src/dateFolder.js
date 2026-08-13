// Shared by every pull pipeline (Shopee + Lazada) and the SharePoint
// uploader, so a single day's run always lands in matching local/remote
// folder names — e.g. downloads/2026-08-06/... uploads into Data/2026-08-06/.
function todayDateFolder() {
  const bangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = bangkok.getUTCFullYear();
  const m = String(bangkok.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bangkok.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = { todayDateFolder };
