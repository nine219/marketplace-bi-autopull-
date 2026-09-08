// Posts one pull/upload result into MS Teams via a Power Automate HTTP
// trigger (TEAMS_WEBHOOK_URL in .env). Confirmed by inspecting the flow's
// run history: its "Post card in a chat or channel" action binds the
// Adaptive Card content directly to the raw trigger body, so the POST body
// here must itself be a complete, valid Adaptive Card JSON object — not a
// custom flat schema.
const TITLE = 'File Dashboard Seller Center';

function formatInfoDate(isoDate) {
  // isoDate is YYYY-MM-DD (see dateFolder.js) -> Info Date wants DD-MM-YYYY.
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

function buildAdaptiveCard({ date, platform, status, link }) {
  const emoji = status === 'Success' ? '✅' : '❌';
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: `${emoji} ${TITLE}`, weight: 'Bolder', size: 'Medium', wrap: true },
      { type: 'TextBlock', text: `Info Date: ${formatInfoDate(date)}`, spacing: 'Medium', wrap: true },
      { type: 'TextBlock', text: `Platform: ${platform}`, wrap: true },
      { type: 'TextBlock', text: `Status: ${status}`, wrap: true },
      { type: 'TextBlock', text: `Link: ${link || ''}`, wrap: true },
    ],
  };
}

// Best-effort: a Teams notification failure should never fail the pull/
// upload run, so this only logs and never throws.
async function sendTeamsAlert({ date, platform, status, link }) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('TEAMS_WEBHOOK_URL not set in .env — skipping Teams alert.');
    return;
  }

  const card = buildAdaptiveCard({ date, platform, status, link });

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Teams alert failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.warn(`Teams alert failed: ${err.message}`);
  }
}

module.exports = { sendTeamsAlert };
