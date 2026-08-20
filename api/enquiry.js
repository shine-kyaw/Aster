/* ============================================================
   /api/enquiry — the studio's real inbox.

   Why this exists
   ---------------
   Enquiries used to be written to the *visitor's own* browser
   localStorage and nowhere else. Nothing was ever transmitted, so
   the studio never saw a single one — and the form still said
   "your message is in". Every lead submitted was lost silently.

   This endpoint is the fix. It runs on Vercel (server side), so:
     • the enquiry actually leaves the visitor's machine;
     • the provider key lives in an env var instead of being
       printed in public HTML for anyone to read and abuse;
     • a failure is a real failure the form can report honestly.

   POST /api/enquiry        → validate, email the studio, return a code
   GET  /api/enquiry?code=X → look an enquiry back up (needs storage)

   Configure with these environment variables in the Vercel
   dashboard (Project → Settings → Environment Variables):

   Email delivery — set ONE of:
     RESEND_API_KEY      Resend (resend.com). Verify astermade.com as
                         a sending domain, then mail arrives from the
                         studio's own address. Preferred.
     WEB3FORMS_KEY       Web3Forms (web3forms.com). No domain setup;
                         paste the access key and it forwards to the
                         address you registered. Fastest to switch on.
                         NOTE: Web3Forms decides the recipient from the
                         key's own account, so ASTER_TO_EMAIL does NOT
                         apply on this path — register the key against
                         the address you want the mail to land in.

   Optional:
     ASTER_TO_EMAIL      Comma-separated recipients. Resend path only
                         (see the Web3Forms note above). Defaults to
                         marketing@astermade.com, shine@astermade.com.
     ASTER_FROM_EMAIL    Resend "from" address. Must be on a domain
                         verified in Resend.
     KV_REST_API_URL     Upstash/Vercel KV. Set both to persist
     KV_REST_API_TOKEN   enquiries so tracking codes resolve from any
                         device. Without them, delivery still works —
                         only lookup is unavailable.
   ============================================================ */

const TO_EMAILS = (process.env.ASTER_TO_EMAIL ||
  "marketing@astermade.com,shine@astermade.com")
  .split(",").map(s => s.trim()).filter(Boolean);

const FROM_EMAIL = process.env.ASTER_FROM_EMAIL ||
  "Aster Studio <enquiries@astermade.com>";

// Generous enough for a real enquiry, tight enough to blunt abuse.
const LIMITS = { name: 120, email: 200, phone: 60, message: 5000 };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

function generateCode() {
  const block = () => Array.from({ length: 4 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join("");
  return `ASTER-${block()}-${block()}`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// Deliberately permissive — the goal is to catch typos and junk, not
// to adjudicate the RFC. A real address that trips a clever regex is
// a lost client; a fake one that slips through is just noise.
function looksLikeEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/* ---------- optional persistence (Upstash / Vercel KV REST) ---------- */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
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
  // an admin view can page through recent enquiries later.
  await kvCommand(["SET", `enquiry:${record.code}`, JSON.stringify(record)]);
  await kvCommand(["LPUSH", "enquiry:index", record.code]);
  await kvCommand(["LTRIM", "enquiry:index", 0, 999]);
}

async function loadEnquiry(code) {
  const result = await kvCommand(["GET", `enquiry:${code}`]);
  if (!result || !result.result) return null;
  return JSON.parse(result.result);
}

/* ---------- email delivery ---------- */

function buildEmail({ name, email, phone, message, code, meta }) {
  const subject = `New enquiry — ${name} (${code})`;

  const text = [
    `New enquiry from the Aster site`,
    ``,
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone || "—"}`,
    `Code:    ${code}`,
    `Sent:    ${meta.receivedAt}`,
    ``,
    `Message`,
    `-------`,
    message,
    ``,
    `Reply straight to this email to answer ${name.split(" ")[0]} directly.`
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;max-width:640px;margin:0 auto;color:#1f1d18">
  <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6b6456;margin:0 0 6px">New enquiry</p>
  <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 22px">${escapeHtml(name)}</h1>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    <tr><td style="padding:8px 0;color:#6b6456;width:88px">Email</td><td style="padding:8px 0"><a href="mailto:${escapeHtml(email)}" style="color:#5e3d8a">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding:8px 0;color:#6b6456">Phone</td><td style="padding:8px 0">${escapeHtml(phone) || "—"}</td></tr>
    <tr><td style="padding:8px 0;color:#6b6456">Code</td><td style="padding:8px 0;font-family:ui-monospace,monospace">${escapeHtml(code)}</td></tr>
    <tr><td style="padding:8px 0;color:#6b6456">Sent</td><td style="padding:8px 0">${escapeHtml(meta.receivedAt)}</td></tr>
  </table>
  <div style="border-left:2px solid #d8cfb8;padding:2px 0 2px 18px;font-size:15px;line-height:1.65;white-space:pre-wrap">${escapeHtml(message)}</div>
  <p style="font-size:13px;color:#6b6456;margin-top:28px;padding-top:18px;border-top:1px solid #e3dac3">
    Reply straight to this email to answer ${escapeHtml(name.split(" ")[0])} directly.
  </p>
</div>`.trim();

  return { subject, text, html };
}

async function sendViaResend(payload) {
  const { subject, text, html } = buildEmail(payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TO_EMAILS,
      reply_to: payload.email, // so a reply reaches the enquirer, not us
      subject,
      text,
      html
    })
  });
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }
}

async function sendViaWeb3Forms(payload) {
  const { subject } = buildEmail(payload);
  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: process.env.WEB3FORMS_KEY,
      subject,
      from_name: "Aster Studio website",
      replyto: payload.email,
      name: payload.name,
      email: payload.email,
      phone: payload.phone || "—",
      message: payload.message,
      tracking_code: payload.code,
      received_at: payload.meta.receivedAt
    })
  });
  if (!response.ok) {
    throw new Error(`Web3Forms ${response.status}: ${await response.text()}`);
  }
}

function deliver(payload) {
  if (process.env.RESEND_API_KEY) return sendViaResend(payload);
  if (process.env.WEB3FORMS_KEY) return sendViaWeb3Forms(payload);
  return null; // nothing configured — caller reports this honestly
}

/* ---------- handler ---------- */

module.exports = async function handler(req, res) {
  if (req.method === "GET") return handleLookup(req, res);
  if (req.method === "POST") return handleSubmit(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};

async function handleLookup(req, res) {
  const query = req.query || {};

  // Capability probe. The page uses this to decide whether to offer
  // code tracking at all, so it never advertises a feature that is
  // switched off. Reveals nothing beyond "is lookup available".
  if (query.probe) {
    return res.status(200).json({ ok: true, tracking: kvEnabled });
  }

  const code = String(query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code." });

  if (!kvEnabled) {
    return res.status(501).json({
      ok: false,
      reason: "no-storage",
      error: "Lookup isn't switched on yet."
    });
  }

  try {
    const found = await loadEnquiry(code);
    if (!found) return res.status(404).json({ ok: false, error: "No message found for that code." });
    // Only ever return what the sender already knows about their own note.
    return res.status(200).json({
      ok: true,
      enquiry: {
        code: found.code,
        status: found.status || "Received",
        message: found.message,
        previewUrl: found.previewUrl || "",
        time: found.time
      }
    });
  } catch (error) {
    console.error("[enquiry] lookup failed:", error);
    return res.status(502).json({ ok: false, error: "Couldn't reach the archive." });
  }
}

async function handleSubmit(req, res) {
  // Vercel parses JSON bodies; tolerate a raw string just in case.
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Honeypot: a real person never sees or ticks this. Answer 200 so a
  // bot learns nothing from the response.
  if (body.botcheck) return res.status(200).json({ ok: true, code: generateCode() });

  const field = (key) => String(body[key] == null ? "" : body[key]).trim();
  const name = field("name").slice(0, LIMITS.name);
  const email = field("email").slice(0, LIMITS.email);
  const phone = field("phone").slice(0, LIMITS.phone);
  const message = field("message").slice(0, LIMITS.message);

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: "Please add your name, email, and a short message." });
  }
  if (!looksLikeEmail(email)) {
    return res.status(400).json({ ok: false, error: "That email doesn't look quite right — mind checking it?" });
  }

  const code = generateCode();
  const record = {
    code, name, email, phone, message,
    status: "Received",
    previewUrl: "",
    time: Date.now()
  };
  const payload = {
    name, email, phone, message, code,
    meta: { receivedAt: new Date(record.time).toUTCString() }
  };

  // Delivery is the part that must not fail quietly — it is the only
  // reason the form exists. Storage is a convenience on top.
  const delivery = deliver(payload);
  if (!delivery) {
    console.error("[enquiry] no delivery provider configured — set RESEND_API_KEY or WEB3FORMS_KEY");
    return res.status(503).json({
      ok: false,
      reason: "unconfigured",
      error: "This form isn't connected to our inbox yet."
    });
  }

  try {
    await delivery;
  } catch (error) {
    console.error("[enquiry] delivery failed:", error);
    return res.status(502).json({
      ok: false,
      reason: "delivery-failed",
      error: "We couldn't get your message through."
    });
  }

  // The enquiry is safely in the studio's inbox from here. A storage
  // failure must not turn a delivered message into an error page.
  if (kvEnabled) {
    try { await saveEnquiry(record); }
    catch (error) { console.error("[enquiry] stored copy failed:", error); }
  }

  return res.status(200).json({ ok: true, code, tracking: kvEnabled });
}
