// POST /api/register
// Body: { "username": "…", "email": "…", "password": "…", "flag": "🇵🇭" }
// Returns: { "message": "…", "user": {…} }

import { handleOptions, requireMethod, getBody, ok, err,
         sql, bcrypt } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  const body     = getBody(req);
  const uname    = (body.username ?? '').trim();
  const email    = (body.email    ?? '').trim();
  const password = body.password  ?? '';
  const flag     = (body.flag     ?? '🏳️').trim();

  if (uname.length < 2 || uname.length > 24) return err(res, 'Username must be 2–24 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 'Invalid email address.');
  if (password.length < 6) return err(res, 'Password must be at least 6 characters.');

  const existing = await sql`
    SELECT id FROM users WHERE username = ${uname} OR email = ${email}
  `;
  if (existing.length) return err(res, 'Username or email already in use.', 409);

  const hash = await bcrypt.hash(password, 10);
  const result = await sql`
    INSERT INTO users (username, display_name, email, password_hash, flag, created_at)
    VALUES (${uname}, ${uname}, ${email}, ${hash}, ${flag}, NOW())
    RETURNING id
  `;

  ok(res, {
    message: 'Account created successfully.',
    user: { id: result[0].id, username: uname, display_name: uname, email, flag },
  }, 201);
}
