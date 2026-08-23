/* ============================================================
   /api/admin/enquiries — password-gated enquiry console API.

   This is the real replacement for the old #staff console, which
   was gated by a password hardcoded in public JavaScript — readable
   by anyone via view-source, protecting data that had never left the
   visitor's own browser to begin with.

   Here, the key never ships in any file the browser downloads. The
   staff page (staff.html) asks for it at runtime and sends it as a
   header on every request; this endpoint compares it against
   ADMIN_KEY, an env var that only exists on the server. A wrong or
   missing key gets a plain 401, nothing more.

   GET   → list recent enquiries
   PATCH → attach a reply (and optionally a status / preview link) to
            one enquiry by code, so a visitor entering that code on
            the site sees it under "Track your message"

   Configure in Vercel (Project → Settings → Environment Variables):
     ADMIN_KEY       The staff passphrase. Pick something you wouldn't
                     mind typing on a shared screen but couldn't be
                     guessed — this is the only lock on the door.
     DATABASE_URL    Same Neon Postgres database as api/enquiry.js —
                     without it there is nothing to list or reply to.
   ============================================================ */

const crypto = require("crypto");
const { dbEnabled, listEnquiries, replyToEnquiry } = require("../../lib/db");

// Plain !== leaks how many leading characters matched via response
// timing. Buffer lengths must match before timingSafeEqual will even
// run, so a length mismatch is handled separately first.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAuth(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return { ok: false, status: 501, error: "Staff access isn't configured yet." };
  const supplied = req.headers["x-admin-key"];
  if (!supplied || !safeEqual(supplied, adminKey)) {
    return { ok: false, status: 401, error: "Incorrect key." };
  }
  return { ok: true };
}

module.exports = async function handler(req, res) {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (!dbEnabled) {
    return res.status(501).json({
      ok: false,
      error: "Storage isn't switched on yet — set DATABASE_URL (a Neon Postgres connection string) to enable the staff console."
    });
  }

  if (req.method === "GET") return handleList(req, res);
  if (req.method === "PATCH") return handleReply(req, res);
  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};

async function handleList(req, res) {
  try {
    const enquiries = await listEnquiries();
    return res.status(200).json({ ok: true, enquiries });
  } catch (error) {
    console.error("[admin/enquiries] list failed:", error);
    return res.status(502).json({ ok: false, error: "Couldn't reach the archive." });
  }
}

async function handleReply(req, res) {
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code." });

  const reply = typeof body.reply === "string" ? body.reply.trim() : undefined;
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim() : undefined;
  const previewUrl = typeof body.previewUrl === "string" ? body.previewUrl.trim() : undefined;

  if (reply === undefined && status === undefined && previewUrl === undefined) {
    return res.status(400).json({ ok: false, error: "Nothing to save." });
  }

  try {
    const updated = await replyToEnquiry(code, { reply, status, previewUrl });
    if (!updated) return res.status(404).json({ ok: false, error: "No enquiry found for that code." });
    return res.status(200).json({ ok: true, enquiry: updated });
  } catch (error) {
    console.error("[admin/enquiries] reply failed:", error);
    return res.status(502).json({ ok: false, error: "Couldn't save that reply." });
  }
}
