// GET /api/me
// Header: Authorization: Bearer <token>

import { handleOptions, requireMethod, ok, db,
         requireAuth, recalcStreak } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const userId = auth.user_id;

  const { rows: stats } = await db.query(
    `SELECT COUNT(*) AS games,
            COALESCE(MAX(score), 0) AS best,
            COALESCE(SUM(score), 0) AS total,
            COALESCE(AVG(score), 0) AS avg
     FROM   scores WHERE user_id = $1`,
    [userId]
  );
  const s = stats[0];

  const { rows: history } = await db.query(
    `SELECT score, total_questions, submitted_at
     FROM   scores WHERE user_id = $1
     ORDER  BY submitted_at DESC LIMIT 5`,
    [userId]
  );

  const streak = await recalcStreak(userId);

  ok(res, {
    user: {
      id:      userId,
      username: auth.username,
      email:   auth.email,
      streak,
      games:   Number(s.games),
      best:    Number(s.best),
      total:   Number(s.total),
      avg:     Math.round(parseFloat(s.avg) * 10) / 10,
      history,
    },
  });
}
