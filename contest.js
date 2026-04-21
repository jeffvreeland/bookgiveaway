const express = require('express');
const pool = require('../db');

const router = express.Router();

const GHL_TOKEN      = process.env.GHL_API_TOKEN;
const GHL_LOCATION   = process.env.GHL_LOCATION_ID;
const GHL_TAG        = 'jmtbook-april-2026';
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY;
const ADMIN_KEY      = process.env.CONTEST_ADMIN_KEY;

// ── Landing page ──────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.render('contest', { hcaptchaSiteKey: process.env.HCAPTCHA_SITE_KEY });
});

// ── Form submission ───────────────────────────────────────────────────────────

router.post('/enter', async (req, res) => {
  const { name, email, mobile, 'h-captcha-response': htoken } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

  // Basic server-side field validation
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[\+\d][\d\s\-\(\)]{7,}$/;
  const nameParts = (name || '').trim().split(/\s+/);

  if (nameParts.length < 2 || !emailRe.test((email || '').trim()) || !phoneRe.test((mobile || '').trim())) {
    return res.status(400).json({ error: 'Invalid input. Please check your details and try again.' });
  }

  // hCaptcha verification
  try {
    const capRes = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: HCAPTCHA_SECRET, response: htoken || '', remoteip: ip }),
    });
    const cap = await capRes.json();
    if (!cap.success) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
  } catch {
    return res.status(500).json({ error: 'Could not verify CAPTCHA. Please try again.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName  = name.trim();
  const firstName  = nameParts[0];
  const lastName   = nameParts.slice(1).join(' ');

  // Duplicate check
  const { rows: existing } = await pool.query(
    'SELECT id FROM contest_entries WHERE LOWER(email) = $1',
    [cleanEmail]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: 'duplicate', message: "Looks like you've already entered — good luck! 🎉" });
  }

  // Store in DB
  try {
    await pool.query(
      'INSERT INTO contest_entries (name, email, mobile, ip_address) VALUES ($1, $2, $3, $4)',
      [cleanName, cleanEmail, mobile.trim(), ip]
    );
  } catch (e) {
    // Race condition duplicate
    if (e.code === '23505') {
      return res.status(409).json({ error: 'duplicate', message: "Looks like you've already entered — good luck! 🎉" });
    }
    console.error('Contest DB error:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  // GoHighLevel — fire and forget (don't block the user response)
  sendToGHL(firstName, lastName, cleanEmail, mobile.trim()).catch(e =>
    console.error('GHL error:', e)
  );

  return res.json({ ok: true, firstName });
});

async function sendToGHL(firstName, lastName, email, phone) {
  const body = {
    locationId: GHL_LOCATION,
    firstName,
    lastName,
    email,
    phone,
    tags: [GHL_TAG],
  };
  const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GHL_TOKEN}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL ${res.status}: ${text}`);
  }
}

// ── Admin — view entries ──────────────────────────────────────────────────────

router.get('/admin', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).send('Forbidden');
  }
  try {
    const { rows: entries } = await pool.query(
      'SELECT * FROM contest_entries ORDER BY created_at DESC'
    );
    const winnerCount = entries.filter(e => e.is_winner).length;
    res.render('contest-admin', { entries, winnerCount, key: req.query.key });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

// ── Admin — pick winners ──────────────────────────────────────────────────────

router.post('/admin/pick', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).send('Forbidden');
  }
  try {
    // Clear previous winners, pick 10 at random
    await pool.query('UPDATE contest_entries SET is_winner = FALSE');
    await pool.query(`
      UPDATE contest_entries
      SET is_winner = TRUE
      WHERE id IN (
        SELECT id FROM contest_entries ORDER BY RANDOM() LIMIT 10
      )
    `);
    res.redirect(`/admin?key=${encodeURIComponent(req.query.key)}`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

// ── Admin — reset winners ─────────────────────────────────────────────────────

router.post('/admin/reset', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).send('Forbidden');
  }
  try {
    await pool.query('UPDATE contest_entries SET is_winner = FALSE');
    res.redirect(`/admin?key=${encodeURIComponent(req.query.key)}`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

module.exports = router;
