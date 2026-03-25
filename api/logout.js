// POST /api/logout
// Header: Authorization: Bearer <token>

import { handleOptions, requireMethod, ok, db } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  const header = req.headers['authorization'] ?? '';
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (m) await db.query('DELETE FROM sessions WHERE token = $1', [m[1]]);

  ok(res, { message: 'Logged out successfully.' });
}
