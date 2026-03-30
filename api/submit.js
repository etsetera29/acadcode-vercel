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

  const userId           = auth.user_id;
  const body             = getBody(req);
  const score            = parseInt(body.score            ?? -1, 10);
  const total            = parseInt(body.total_questions  ?? 10, 10);
  const timeTakenSeconds = parseInt(body.time_taken_seconds ?? 0, 10);
  const startedAt        = body.started_at ? new Date(body.started_at) : null;

  if (isNaN(score) || score < 0 || score > total) return err(res, 'Invalid score value.');

  // Use Philippine Time (UTC+8) for daily boundary — resets at midnight PHT
  const dup = await sql`
    SELECT id FROM scores
    WHERE  user_id = ${userId}
      AND (submitted_at AT TIME ZONE 'Asia/Manila')::date
        = (NOW() AT TIME ZONE 'Asia/Manila')::date
  `;
  if (dup.length) return err(res, 'You have already submitted a score today. Come back tomorrow!', 409);

  await sql`
    INSERT INTO scores (user_id, score, total_questions, submitted_at, started_at, time_taken_seconds)
    VALUES (${userId}, ${score}, ${total}, NOW(), ${startedAt}, ${timeTakenSeconds})
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

  // ms until midnight Philippine Time (UTC+8) for frontend countdown
  const nowUtcMs           = Date.now();
  const phtOffsetMs        = 8 * 60 * 60 * 1000;
  const nowPhtMs           = nowUtcMs + phtOffsetMs;
  const todayPhtMidnightMs = Math.floor(nowPhtMs / 86_400_000) * 86_400_000;
  const nextResetMs        = (todayPhtMidnightMs + 86_400_000) - nowPhtMs;

  ok(res, { message: 'Score saved!', score, streak, rank: Number(rankRow[0].rank_pos), nextResetMs });
}
