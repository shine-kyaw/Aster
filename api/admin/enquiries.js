/* ============================================================
   GET /api/admin/enquiries — password-gated list of enquiries.

   This is the real replacement for the old #staff console, which
   was gated by a password hardcoded in public JavaScript — readable
   by anyone via view-source, protecting data that had never left the
   visitor's own browser to begin with.

   Here, the key never ships in any file the browser downloads. The
   staff page (staff.html) asks for it at runtime and sends it as a
   header on every request; this endpoint compares it against
   ADMIN_KEY, an env var that only exists on the server. A wrong or
   missing key gets a plain 401, nothing more.

   Configure in Vercel (Project → Settings → Environment Variables):
     ADMIN_KEY            The staff passphrase. Pick something you
                          wouldn't mind typing on a shared screen but
                          couldn't be guessed — this is the only lock
                          on the door.
     KV_REST_API_URL      Same Upstash/Vercel KV as api/enquiry.js —
     KV_REST_API_TOKEN    without these, there is nothing to list yet.
   ============================================================ */

const crypto = require("crypto");
const { kvEnabled, listEnquiries } = require("../../lib/kv");

// Plain !== leaks how many leading characters matched via response
// timing. Buffer lengths must match before timingSafeEqual will even
// run, so a length mismatch is handled separately first.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(501).json({ ok: false, error: "Staff access isn't configured yet." });
  }

  const supplied = req.headers["x-admin-key"];
  if (!supplied || !safeEqual(supplied, adminKey)) {
    return res.status(401).json({ ok: false, error: "Incorrect key." });
  }

  if (!kvEnabled) {
    return res.status(501).json({
      ok: false,
      error: "Storage isn't switched on yet — connect Vercel KV to the project to enable the staff console."
    });
  }

  try {
    const enquiries = await listEnquiries();
    return res.status(200).json({ ok: true, enquiries });
  } catch (error) {
    console.error("[admin/enquiries] list failed:", error);
    return res.status(502).json({ ok: false, error: "Couldn't reach the archive." });
  }
};
