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

   Email delivery — configure ONE of these three. They are tried in
   the order listed, so setting SMTP_* wins over the others.

   1. SMTP — the studio's own Namecheap Private Email mailbox. No
      third party sees an enquiry and no DNS change is needed, because
      astermade.com already publishes include:spf.privateemail.com.
        SMTP_HOST         mail.privateemail.com
        SMTP_PORT         465 (implicit TLS) or 587 (STARTTLS)
        SMTP_USER         the full mailbox address to send as
        SMTP_PASS         that mailbox's password
      Uses a mailbox created purely for this (babullee@astermade.com),
      not a person's real inbox: this password sits in Vercel's env
      vars, and unlike an API key it cannot be scoped, so anything it
      can reach is exposed if it ever leaks. A dedicated sender
      mailbox keeps the blast radius to sending mail.

   2. RESEND_API_KEY     Resend (resend.com). Needs DNS records, but
                         the key is scoped and revocable — the safer
                         option if SMTP ever proves flaky.
   3. WEB3FORMS_KEY      Web3Forms (web3forms.com). No domain setup at
                         all, but api.web3forms.com sits behind a
                         Cloudflare "managed challenge" that blocks
                         server-to-server calls like this one (no
                         browser to solve it) — confirmed failing with
                         HTTP 403 in production, so treat this as a
                         non-working fallback until that changes.
                         NOTE: Web3Forms also decides the recipient
                         from the key's own account, so ASTER_TO_EMAIL
                         does NOT apply on this path.

   Optional:
     ASTER_TO_EMAIL      Comma-separated recipients. Applies to the
                         SMTP and Resend paths (see the Web3Forms note
                         above). Defaults to marketing@astermade.com
                         alone, because that address is an alias that
                         already forwards to shine@ — listing both
                         would deliver two copies of every enquiry to
                         the same inbox. Add more addresses here once
                         they are real mailboxes.
     ASTER_FROM_EMAIL    The "from" address. On SMTP it must normally
                         match SMTP_USER — most providers, Namecheap
                         included, reject a From they didn't
                         authenticate — so it defaults to SMTP_USER and
                         is better left unset. On Resend it must be on
                         a domain verified there.
     DATABASE_URL        Neon Postgres connection string (Neon project
                         dashboard → Connection Details). Persists
                         enquiries so tracking codes resolve from any
                         device, and backs the staff console at
                         /staff.html. The table is created
                         automatically on first use — see lib/db.js.
                         Without this, delivery still works — only
                         lookup and the staff console are unavailable.
     NTFY_TOPIC          Optional second channel: a phone push via ntfy
                         (install the ntfy app, subscribe to this topic).
                         Use a long, unguessable topic name. The push
                         carries the sender's name and the first ~90
                         characters of the message through ntfy's servers
                         (or your own, with NTFY_SERVER), nothing else.
     NTFY_SERVER         Optional. Defaults to https://ntfy.sh.
     NOTIFY_WEBHOOK_URL  Optional third channel: any Slack- or Discord-style
                         incoming webhook. Same minimal content.
                         The studio is told if ANY configured channel
                         succeeds, so one broken route cannot silence the
                         others.
   ============================================================ */

const TO_EMAILS = (process.env.ASTER_TO_EMAIL ||
  "marketing@astermade.com")
  .split(",").map(s => s.trim()).filter(Boolean);

const FROM_EMAIL = process.env.ASTER_FROM_EMAIL ||
  "Aster Studio <enquiries@astermade.com>";

// Generous enough for a real enquiry, tight enough to blunt abuse.
const LIMITS = { name: 120, email: 200, phone: 60, message: 5000 };

// Different messages one address may store per hour before further ones are
// acknowledged without being saved again. Generous for a real person.
const MAX_PER_HOUR = 5;

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

/* ---------- optional persistence (Neon Postgres) ---------- */
// Shared with api/admin/enquiries.js — see lib/kv.js.
const { dbEnabled, saveEnquiry, loadEnquiry, markNotified, recentByEmail } = require("../lib/db");

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

async function sendViaSmtp(payload) {
  // Required lazily so the other delivery paths don't pay nodemailer's
  // load cost on a cold start.
  const nodemailer = require("nodemailer");

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 speaks TLS from the first byte; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // A serverless function has a hard time limit. Failing in a few seconds
    // lets the other channels run and lets the visitor hear back, instead of
    // the function being killed mid-connection with no answer at all.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });

  const { subject, text, html } = buildEmail(payload);
  await transporter.sendMail({
    // Namecheap rejects a From it didn't authenticate, so this tracks
    // SMTP_USER unless deliberately overridden.
    from: process.env.ASTER_FROM_EMAIL || `Aster Studio <${process.env.SMTP_USER}>`,
    to: TO_EMAILS.join(", "),
    replyTo: payload.email, // so a reply reaches the enquirer, not us
    subject,
    text,
    html
  });
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
  const smtpReady = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  const providers = [];
  if (smtpReady) providers.push(["smtp", sendViaSmtp]);
  if (process.env.RESEND_API_KEY) providers.push(["resend", sendViaResend]);
  if (process.env.WEB3FORMS_KEY) providers.push(["web3forms", sendViaWeb3Forms]);
  if (!providers.length) return null; // nothing configured — caller reports this honestly

  // Try each configured provider in turn until one works. This used to stop at
  // the FIRST configured provider, so a stale one (an old mailbox password)
  // silently blocked a newly added, working one.
  return (async () => {
    let last;
    for (const [name, send] of providers) {
      try { await send(payload); return; }
      catch (error) { last = error; console.error(`[enquiry] ${name} failed, trying next:`, error); }
    }
    throw last;
  })();
}

// A short, one-line summary for the push channels. Deliberately minimal: the
// full message lives in the email and the staff console, not on a third
// party's servers.
function brief({ name, message, code }) {
  const preview = String(message).replace(/\s+/g, " ").slice(0, 90);
  return `${name}: ${preview}${String(message).length > 90 ? "…" : ""} (${code})`;
}

async function notifyNtfy(payload) {
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const response = await fetch(`${server}/${encodeURIComponent(process.env.NTFY_TOPIC)}`, {
    method: "POST",
    // Header values must be plain ASCII, so the name goes in the body.
    headers: {
      Title: "New Aster enquiry",
      Priority: "high",
      Tags: "incoming_envelope",
      Click: "https://www.astermade.com/staff.html"
    },
    body: brief(payload),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`ntfy ${response.status}`);
}

async function notifyWebhook(payload) {
  const text = `New Aster enquiry — ${brief(payload)}`;
  const response = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `content` is Discord's field, `text` is Slack's; each ignores the other.
    body: JSON.stringify({ content: text, text }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`webhook ${response.status}`);
}

// Every channel that is configured. The studio counts as notified if ANY of
// them goes through, so one broken route (an expired mailbox password, say)
// can no longer silence an enquiry. Empty means nothing is set up at all.
function buildNotifiers(payload) {
  const list = [];
  const email = deliver(payload);
  if (email) list.push({ name: "email", promise: email });
  if (process.env.NTFY_TOPIC) list.push({ name: "ntfy", promise: notifyNtfy(payload) });
  if (process.env.NOTIFY_WEBHOOK_URL) list.push({ name: "webhook", promise: notifyWebhook(payload) });
  return list;
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
    return res.status(200).json({ ok: true, tracking: dbEnabled });
  }

  const code = String(query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code." });

  if (!dbEnabled) {
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
        reply: found.reply || "",
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

  const now = Date.now();

  // Duplicate and flood guard. A visitor who is told "we couldn't get your
  // message through" naturally tries again, and every retry used to be saved
  // as a brand-new enquiry (one person produced 31). Now:
  //  - the same message from the same address within the hour is the SAME
  //    enquiry: if the studio was already told, the visitor just gets their
  //    original code back; if not, the notification is retried on that row;
  //  - more than a handful of different messages from one address in an hour
  //    are acknowledged but not stored again. Never blocks a first message.
  let recent = [];
  if (dbEnabled) {
    try { recent = await recentByEmail(email, now - 60 * 60 * 1000); }
    catch (error) { console.error("[enquiry] duplicate check failed:", error); }
  }
  const same = recent.find(r => r.message === message);
  if (same && same.notified) {
    return res.status(200).json({ ok: true, code: same.code, tracking: dbEnabled, duplicate: true });
  }
  if (!same && recent.length >= MAX_PER_HOUR) {
    return res.status(200).json({ ok: true, code: recent[0].code, tracking: dbEnabled, duplicate: true });
  }

  const code = same ? same.code : generateCode();
  const record = {
    code, name, email, phone, message,
    status: "Received",
    previewUrl: "",
    time: now,
    notified: false
  };
  const payload = {
    name, email, phone, message, code,
    meta: { receivedAt: new Date(record.time).toUTCString() }
  };

  // Store first, as an un-notified row. The staff console reads this record,
  // not the inbox: a mail hiccup must not also make the enquiry invisible.
  let stored = Boolean(same);
  if (dbEnabled && !same) {
    try { await saveEnquiry(record); stored = true; }
    catch (error) { console.error("[enquiry] stored copy failed:", error); }
  }

  // Tell the studio. Every configured channel runs; any one succeeding counts.
  const notifiers = buildNotifiers(payload);
  if (!notifiers.length) {
    console.error("[enquiry] no notification channel configured — set SMTP_HOST/SMTP_USER/SMTP_PASS, RESEND_API_KEY, WEB3FORMS_KEY, NTFY_TOPIC or NOTIFY_WEBHOOK_URL");
    return res.status(503).json({
      ok: false,
      reason: "unconfigured",
      error: "This form isn't connected to our inbox yet."
    });
  }
  const results = await Promise.allSettled(notifiers.map(n => n.promise));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[enquiry] ${notifiers[i].name} notification failed:`, r.reason);
  });
  const notified = results.some(r => r.status === "fulfilled");

  if (stored && dbEnabled && notified) {
    try { await markNotified(code, true); }
    catch (error) { console.error("[enquiry] could not mark notified:", error); }
  }

  if (!notified) {
    // Honest failure: the visitor is told so (and offered a mailto), and a
    // retry re-notifies THIS row instead of creating another.
    return res.status(502).json({
      ok: false,
      reason: "delivery-failed",
      error: "We couldn't get your message through."
    });
  }

  return res.status(200).json({ ok: true, code, tracking: dbEnabled });
}
