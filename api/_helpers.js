// ─────────────────────────────────────────────────────────────────
//  AcadCode — Shared API Helpers
//  Uses @vercel/postgres — reads POSTGRES_URL automatically.
//  Files prefixed _ are not treated as Vercel functions.
// ─────────────────────────────────────────────────────────────────

import { db }  from '@vercel/postgres';
import bcrypt  from 'bcryptjs';
import crypto  from 'crypto';

export { db, bcrypt, crypto };

// ─── Token TTL ────────────────────────────────────────────────────
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;   // 7 days

// ─── CORS / JSON headers ──────────────────────────────────────────
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

// Returns true if the request was OPTIONS (caller should return immediately)
export function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  setCors(res);
  res.status(204).end();
  return true;
}

// ─── Response helpers ─────────────────────────────────────────────
export function ok(res, data, code = 200) {
  setCors(res);
  res.status(code).json(data);
}

export function err(res, message, code = 400) {
  setCors(res);
  res.status(code).json({ error: message });
}

// ─── Method guard ─────────────────────────────────────────────────
export function requireMethod(req, res, method) {
  if (req.method === method.toUpperCase()) return true;
  err(res, 'Method not allowed.', 405);
  return false;
}

// ─── Body parser ──────────────────────────────────────────────────
export function getBody(req) {
  return (typeof req.body === 'object' && req.body !== null) ? req.body : {};
}

// ─── Token auth ───────────────────────────────────────────────────
// Returns the session+user row, or null if invalid (response already sent).
export async function requireAuth(req, res) {
  const header = req.headers['authorization'] ?? '';
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    err(res, 'Missing or malformed Authorization header.', 401);
    return null;
  }
  const token = m[1];

  const { rows } = await db.query(
    `SELECT s.user_id, s.expires_at, u.username, u.email
     FROM   sessions s
     JOIN   users    u ON u.id = s.user_id
     WHERE  s.token = $1`,
    [token]
  );
  const row = rows[0];

  if (!row) {
    err(res, 'Invalid or expired token. Please log in again.', 401);
    return null;
  }
  if (new Date(row.expires_at) < new Date()) {
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    err(res, 'Session expired. Please log in again.', 401);
    return null;
  }
  return row;
}

// ─── Streak calculator ────────────────────────────────────────────
export async function recalcStreak(userId) {
  const { rows } = await db.query(
    `SELECT submitted_at::date AS day
     FROM   scores
     WHERE  user_id = $1
     GROUP  BY day
     ORDER  BY day DESC`,
    [userId]
  );

  let streak   = 0;
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  let expected = today.getTime();

  for (const { day } of rows) {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === expected) {
      streak++;
      expected -= 86_400_000;
    } else {
      break;
    }
  }

  await db.query('UPDATE users SET streak = $1 WHERE id = $2', [streak, userId]);
  return streak;
}
