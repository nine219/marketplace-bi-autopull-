const fs = require('fs');
const path = require('path');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SITE_HOST = 'mizuhadagroup.sharepoint.com';
const SITE_PATH = '/sites/Shopeesellercenter';

let cachedToken = null; // { value, expiresAt }
let cachedDriveId = null;

// App-only (client credentials) auth — no user/browser involved, matches
// the Azure AD App Registration already set up (client_id/tenant_id/
// client_secret in .env). Verified live: this app already has
// Sites.ReadWrite.All consented, resolving both the site and its "Shared
// Documents" (เอกสาร) drive successfully.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.value;
  }

  const { client_id, tenant_id, client_secret } = process.env;
  if (!client_id || !tenant_id || !client_secret) {
    throw new Error('Missing client_id / tenant_id / client_secret in .env for SharePoint upload');
  }

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
    throw new Error(`Graph token request failed (${res.status}): ${JSON.stringify(json)}`);
  }

  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function graphFetch(pathOrUrl, options = {}) {
  const token = await getAccessToken();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph request failed (${res.status}) ${url}: ${text}`);
  }
  return res;
}

async function getDriveId() {
  if (cachedDriveId) return cachedDriveId;

  const siteRes = await graphFetch(`/sites/${SITE_HOST}:${SITE_PATH}`);
  const site = await siteRes.json();

  const drivesRes = await graphFetch(`/sites/${site.id}/drives`);
  const drives = await drivesRes.json();
  const docLibrary = drives.value.find((d) => d.driveType === 'documentLibrary') || drives.value[0];
  if (!docLibrary) throw new Error('No document library drive found on the SharePoint site');

  cachedDriveId = docLibrary.id;
  return cachedDriveId;
}

// Uploads one local file to remoteFolderPath (forward-slash path relative to
// the drive root, e.g. "Shopee/gentlecolors") under its own filename. Simple
// PUT upload — fine for files under ~4MB, which every report file here is
// (largest seen so far is under 500KB). Creates intermediate folders
// automatically; overwrites if the same filename already exists there.
async function uploadFile(localFilePath, remoteFolderPath) {
  const driveId = await getDriveId();
  const filename = path.basename(localFilePath);
  const remotePath = `${remoteFolderPath.replace(/^\/+|\/+$/g, '')}/${filename}`;
  const content = fs.readFileSync(localFilePath);

  const res = await graphFetch(`/drives/${driveId}/root:/${remotePath}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: content,
  });
  const json = await res.json();
  return { webUrl: json.webUrl, remotePath };
}

// Looks up the webUrl of an existing folder (e.g. "Data/2026-09-08") for
// linking to it, rather than to any one file inside it.
async function getFolderWebUrl(remoteFolderPath) {
  const driveId = await getDriveId();
  const cleanPath = remoteFolderPath.replace(/^\/+|\/+$/g, '');
  const res = await graphFetch(`/drives/${driveId}/root:/${cleanPath}`);
  const json = await res.json();
  return json.webUrl;
}

module.exports = { getAccessToken, getDriveId, uploadFile, getFolderWebUrl, SITE_HOST, SITE_PATH };
