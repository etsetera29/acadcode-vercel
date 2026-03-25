// POST /api/submit
// Header: Authorization: Bearer <token>
// Body:   { "score": 8, "total_questions": 10 }

import { handleOptions, requireMethod, getBody, ok, err,
         sql, requireAuth, recalcStreak } from './_helpers.js';

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

  const dup = await sql`
    SELECT id FROM scores
    WHERE  user_id = ${userId} AND submitted_at::date = CURRENT_DATE
  `;
  if (dup.length) return err(res, 'You have already submitted a score today. Come back tomorrow!', 409);

  await sql`
    INSERT INTO scores (user_id, score, total_questions, submitted_at)
    VALUES (${userId}, ${score}, ${total}, NOW())
  `;

  const streak = await recalcStreak(userId);

  const rankRow = await sql`
    SELECT COUNT(*) + 1 AS rank_pos
    FROM (
      SELECT u.id, MAX(sc.score) AS best, u.streak AS stk
      FROM   scores sc JOIN users u ON u.id = sc.user_id
      GROUP  BY u.id
    ) sub
    WHERE sub.best > ${score} OR (sub.best = ${score} AND sub.stk > ${streak})
  `;

  ok(res, { message: 'Score saved!', score, streak, rank: Number(rankRow[0].rank_pos) });
}
