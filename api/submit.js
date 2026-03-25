// POST /api/submit
// Header: Authorization: Bearer <token>
// Body:   { "score": 8, "total_questions": 10 }

import { handleOptions, requireMethod, getBody, ok, err,
         db, requireAuth, recalcStreak } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const userId = auth.user_id;
  const body   = getBody(req);
  const score  = parseInt(body.score           ?? -1,  10);
  const total  = parseInt(body.total_questions ?? 10, 10);

  if (isNaN(score) || score < 0 || score > total) return err(res, 'Invalid score value.');

  // One submission per calendar day
  const { rows: dup } = await db.query(
    `SELECT id FROM scores
     WHERE  user_id = $1 AND submitted_at::date = CURRENT_DATE`,
    [userId]
  );
  if (dup.length) return err(res, 'You have already submitted a score today. Come back tomorrow!', 409);

  await db.query(
    `INSERT INTO scores (user_id, score, total_questions, submitted_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, score, total]
  );

  const streak = await recalcStreak(userId);

  const { rows: rankRow } = await db.query(
    `SELECT COUNT(*) + 1 AS rank_pos
     FROM (
       SELECT u.id, MAX(sc.score) AS best, u.streak AS stk
       FROM   scores sc JOIN users u ON u.id = sc.user_id
       GROUP  BY u.id
     ) sub
     WHERE sub.best > $1 OR (sub.best = $1 AND sub.stk > $2)`,
    [score, streak]
  );

  ok(res, { message: 'Score saved!', score, streak, rank: Number(rankRow[0].rank_pos) });
}
