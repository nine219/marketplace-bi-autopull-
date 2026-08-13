// Throwaway exploration script — NOT part of the final automation.
// Verifies the Azure AD app credentials in .env can actually acquire a
// Graph token and resolve the target SharePoint site, before building any
// real upload pipeline on top of them.
require('dotenv').config();

const { client_id, tenant_id, client_secret } = process.env;

async function getToken() {
  const url = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id,
    client_secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function graphGet(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

(async () => {
  console.log('Requesting token...');
  const token = await getToken();
  console.log('Token acquired, length:', token.length);

  console.log('Resolving site...');
  const site = await graphGet(token, '/sites/mizuhadagroup.sharepoint.com:/sites/Shopeesellercenter');
  console.log('SITE STATUS:', site.status);
  console.log('SITE RESPONSE:', JSON.stringify(site.json, null, 2));

  if (site.ok) {
    const siteId = site.json.id;
    console.log('Listing drives...');
    const drives = await graphGet(token, `/sites/${siteId}/drives`);
    console.log('DRIVES STATUS:', drives.status);
    console.log('DRIVES RESPONSE:', JSON.stringify(drives.json, null, 2));
  }
})().catch((err) => {
  console.error('ERR:', err.message);
  process.exit(1);
});
