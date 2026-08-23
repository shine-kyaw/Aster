/* ============================================================
   lib/kv.js — shared Upstash / Vercel KV REST client.

   Lives outside api/ deliberately: Vercel treats every file under
   api/ as its own serverless function, so shared code has to sit
   elsewhere or it gets deployed (and billed) as an extra endpoint.

   Used by both api/enquiry.js (public submission + lookup) and
   api/admin/enquiries.js (password-gated listing) — one source of
   truth for how an enquiry is stored and read back.
   ============================================================ */

// Vercel discontinued the first-party "Vercel KV" product in favor of
// Marketplace integrations, and Upstash's own SDKs/docs universally use
// the UPSTASH_REDIS_REST_* names — so accept either naming rather than
// depend on exactly which one this project's current integration sets.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const kvEnabled = Boolean(KV_URL && KV_TOKEN);

async function kvCommand(command) {
  const response = await fetch(KV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`KV ${response.status}`);
  return response.json();
}

async function saveEnquiry(record) {
  // Keep the record under its code, and push the code onto a list so
  // the admin view can page through recent enquiries.
  await kvCommand(["SET", `enquiry:${record.code}`, JSON.stringify(record)]);
  await kvCommand(["LPUSH", "enquiry:index", record.code]);
  await kvCommand(["LTRIM", "enquiry:index", 0, 999]);
}

async function loadEnquiry(code) {
  const result = await kvCommand(["GET", `enquiry:${code}`]);
  if (!result || !result.result) return null;
  return JSON.parse(result.result);
}

async function listEnquiries(limit) {
  const idx = await kvCommand(["LRANGE", "enquiry:index", 0, (limit || 200) - 1]);
  const codes = (idx && idx.result) || [];
  if (!codes.length) return [];
  // One MGET round trip rather than N separate GETs.
  const keys = codes.map((code) => `enquiry:${code}`);
  const mres = await kvCommand(["MGET", ...keys]);
  const values = (mres && mres.result) || [];
  return values
    .map((raw) => { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } })
    .filter(Boolean);
}

module.exports = { kvEnabled, saveEnquiry, loadEnquiry, listEnquiries };
