// GET /api/status
// Header: Authorization: Bearer <token>
// Returns: { played: bool, score: int|null, nextResetMs: int }
// "nextResetMs" = milliseconds until midnight Philippine Time (UTC+8)

import { handleOptions, requireMethod, ok, err,
         sql, requireAuth } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const userId = auth.user_id;

  // Check if user has a score recorded today in PHT (Asia/Manila = UTC+8)
  const rows = await sql`
    SELECT score, total_questions, submitted_at
    FROM   scores
    WHERE  user_id = ${userId}
      AND (submitted_at AT TIME ZONE 'Asia/Manila')::date
        = (NOW() AT TIME ZONE 'Asia/Manila')::date
    ORDER BY submitted_at DESC
    LIMIT 1
  `;

  const played = rows.length > 0;
  const score  = played ? rows[0].score : null;
  const total  = played ? rows[0].total_questions : null;

  // Calculate ms until next midnight PHT
  // PHT = UTC+8, so get current time in PHT, find next 00:00 PHT, diff in ms
  const nowUtcMs = Date.now();
  const phtOffsetMs = 8 * 60 * 60 * 1000; // UTC+8
  const nowPhtMs = nowUtcMs + phtOffsetMs;
  const todayPhtMidnightMs = Math.floor(nowPhtMs / 86_400_000) * 86_400_000;
  const nextMidnightPhtMs  = todayPhtMidnightMs + 86_400_000;
  const nextResetMs = nextMidnightPhtMs - nowPhtMs; // ms from now until midnight PHT

  ok(res, { played, score, total, nextResetMs });
}
