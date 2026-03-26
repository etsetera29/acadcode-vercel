// GET  /api/me          — fetch profile
// PATCH /api/me         — update display_name
// Header: Authorization: Bearer <token>

import { handleOptions, ok, err,
         sql, requireAuth, recalcStreak } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const userId = auth.user_id;

  // ── PATCH: change display name ──────────────────────────────────
  if (req.method === 'PATCH') {
    const body        = (typeof req.body === 'object' && req.body) ? req.body : {};
    const displayName = (body.display_name ?? '').trim();

    if (displayName.length < 2 || displayName.length > 32)
      return err(res, 'Display name must be 2–32 characters.');

    await sql`
      UPDATE users SET display_name = ${displayName} WHERE id = ${userId}
    `;
    return ok(res, { message: 'Display name updated.', display_name: displayName });
  }

  // ── GET: fetch profile ──────────────────────────────────────────
  if (req.method !== 'GET') return err(res, 'Method not allowed.', 405);

  const userRow = await sql`
    SELECT display_name, flag, year_level, track_course FROM users WHERE id = ${userId}
  `;
  const display_name = userRow[0]?.display_name ?? auth.username;
  const flag         = userRow[0]?.flag         ?? '🏳️';
  const year_level   = userRow[0]?.year_level   ?? 'college';
  const track_course = userRow[0]?.track_course ?? null;

  const stats = await sql`
    SELECT COUNT(*)                AS games,
           COALESCE(MAX(score), 0) AS best,
           COALESCE(SUM(score), 0) AS total,
           COALESCE(AVG(score), 0) AS avg
    FROM   scores WHERE user_id = ${userId}
  `;
  const s = stats[0];

  const history = await sql`
    SELECT score, total_questions, submitted_at
    FROM   scores WHERE user_id = ${userId}
    ORDER  BY submitted_at DESC LIMIT 5
  `;

  const streak = await recalcStreak(userId);

  ok(res, {
    user: {
      id:           userId,
      username:     auth.username,
      display_name,
      flag,
      year_level,
      track_course,
      email:        auth.email,
      streak,
      games:        Number(s.games),
      best:         Number(s.best),
      total:        Number(s.total),
      avg:          Math.round(parseFloat(s.avg) * 10) / 10,
      history,
    },
  });
}
