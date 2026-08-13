function bangkokNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function ymdDash(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ymdCompact(date) {
  return ymdDash(date).replace(/-/g, '');
}

function todayCompact() {
  return ymdCompact(bangkokNow());
}

function yesterdayCompact() {
  const b = bangkokNow();
  b.setUTCDate(b.getUTCDate() - 1);
  return ymdCompact(b);
}

// Current month, 1st through today — used as the URL dateRange param for
// "this month" exports (dashboard). Lazada auto-clips the displayed data to
// "up to today" even though the end date passed is the calendar month's
// last day (verified live), so passing the true last day is fine and
// slightly simpler than computing "today" for the URL.
function currentMonthRange() {
  const b = bangkokNow();
  const first = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1));
  const last = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0));
  return { start: ymdDash(first), end: ymdDash(last) };
}

// Previous full calendar month — required for the product-performance page
// specifically. Verified live: requesting the CURRENT (in-progress) month on
// that page returns "ไม่มีข้อมูล" (no data); only a fully-completed month
// returns real numbers, unlike the dashboard's month view which works fine
// for the current in-progress month.
function previousMonthRange() {
  const b = bangkokNow();
  const firstOfThisMonth = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1));
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1));
  return { start: ymdDash(firstOfPrevMonth), end: ymdDash(lastOfPrevMonth) };
}

module.exports = {
  bangkokNow,
  ymdDash,
  ymdCompact,
  todayCompact,
  yesterdayCompact,
  currentMonthRange,
  previousMonthRange,
};
