/* ============================================================
   lib/db.js — Neon Postgres client for the enquiry system.

   Lives outside api/ deliberately: Vercel treats every file under
   api/ as its own serverless function, so shared code has to sit
   elsewhere or it gets deployed as an extra endpoint.

   Requires DATABASE_URL — the connection string from your Neon
   project's dashboard (Connection Details). The table is created
   automatically on first use; there is no separate migration step
   to run by hand.
   ============================================================ */

const dbEnabled = Boolean(process.env.DATABASE_URL);

let sqlClient = null;
function sql() {
  if (!sqlClient) {
    // Required lazily so nothing pays the driver's load cost unless
    // a database is actually configured.
    const { neon } = require("@neondatabase/serverless");
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

// CREATE TABLE IF NOT EXISTS is a cheap catalog lookup once the table
// is there, but there is no reason to pay it on every request either —
// a warm serverless instance keeps this resolved promise around and
// skips straight past it on every call after the first.
let ensured = null;
function ensureSchema() {
  if (!ensured) {
    const db = sql();
    ensured = db`
      CREATE TABLE IF NOT EXISTS enquiries (
        code        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        email       TEXT NOT NULL,
        phone       TEXT NOT NULL DEFAULT '',
        message     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'Received',
        preview_url TEXT NOT NULL DEFAULT '',
        reply       TEXT NOT NULL DEFAULT '',
        time        BIGINT NOT NULL,
        replied_at  BIGINT
      )
    `.then(() => sql()`
      CREATE INDEX IF NOT EXISTS enquiries_time_idx ON enquiries (time DESC)
    `).then(() => sql()`
      ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }
  return ensured;
}

function toRecord(row) {
  return {
    code: row.code,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    message: row.message,
    status: row.status || "Received",
    previewUrl: row.preview_url || "",
    reply: row.reply || "",
    time: Number(row.time),
    repliedAt: row.replied_at == null ? null : Number(row.replied_at),
    notified: row.notified !== false
  };
}

async function saveEnquiry(record) {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO enquiries (code, name, email, phone, message, status, preview_url, time, notified)
    VALUES (${record.code}, ${record.name}, ${record.email}, ${record.phone || ""},
            ${record.message}, ${record.status || "Received"}, ${record.previewUrl || ""}, ${record.time},
            ${record.notified === true})
    ON CONFLICT (code) DO NOTHING
  `;
}

async function loadEnquiry(code) {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT * FROM enquiries WHERE code = ${code} LIMIT 1`;
  return rows.length ? toRecord(rows[0]) : null;
}

async function listEnquiries(limit) {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT * FROM enquiries ORDER BY time DESC LIMIT ${limit || 200}`;
  return rows.map(toRecord);
}

// The staff console writes a reply here. previewUrl lets a reply also
// point the visitor at a work-in-progress link; either argument may be
// omitted to leave that field untouched.
async function replyToEnquiry(code, { reply, status, previewUrl }) {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    UPDATE enquiries
    SET reply       = COALESCE(${reply === undefined ? null : reply}, reply),
        status      = COALESCE(${status === undefined ? null : status}, status),
        preview_url = COALESCE(${previewUrl === undefined ? null : previewUrl}, preview_url),
        replied_at  = ${Date.now()}
    WHERE code = ${code}
    RETURNING *
  `;
  return rows.length ? toRecord(rows[0]) : null;
}

// Whether the studio was actually told about this enquiry. A row is saved
// BEFORE anyone is notified (so a mail hiccup can't lose it) and flipped to
// true once at least one notification channel has gone through.
async function markNotified(code, ok) {
  await ensureSchema();
  const db = sql();
  await db`UPDATE enquiries SET notified = ${Boolean(ok)} WHERE code = ${code}`;
}

// The same sender's recent enquiries, newest first. Used to stop one person
// producing dozens of copies (a retry after a failure, a double click, a
// stuck script) without ever blocking a genuine second message.
async function recentByEmail(email, sinceMs) {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT * FROM enquiries
    WHERE lower(email) = lower(${email}) AND time > ${sinceMs}
    ORDER BY time DESC
    LIMIT 12
  `;
  return rows.map(toRecord);
}

module.exports = { dbEnabled, saveEnquiry, loadEnquiry, listEnquiries, replyToEnquiry, markNotified, recentByEmail };
