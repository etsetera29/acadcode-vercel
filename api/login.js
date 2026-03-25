// POST /api/login
// Body: { "username": "…", "password": "…" }
// Returns: { "token": "…", "user": {…} }

import { handleOptions, requireMethod, getBody, ok, err,
         db, bcrypt, crypto, TOKEN_TTL_SECONDS } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  const body     = getBody(req);
  const login    = (body.username ?? '').trim();
  const password = body.password  ?? '';

  if (!login || !password) return err(res, 'Username and password are required.');

  const { rows } = await db.query(
    `SELECT id, username, email, password_hash, streak
     FROM   users WHERE username = $1 OR email = $1`,
    [login]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return err(res, 'Invalid username or password.', 401);
  }

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  await db.query(
    `INSERT INTO sessions (user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [user.id, token, expires]
  );

  const { rows: stats } = await db.query(
    `SELECT COUNT(*) AS games, MAX(score) AS best FROM scores WHERE user_id = $1`,
    [user.id]
  );
  const s = stats[0];

  ok(res, {
    token,
    user: {
      id:       user.id,
      username: user.username,
      email:    user.email,
      streak:   user.streak,
      games:    Number(s.games),
      best:     Number(s.best ?? 0),
    },
  });
}
