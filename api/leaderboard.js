// GET /api/leaderboard
// Public. Query: ?period=all|week|today  &limit=20

import { handleOptions, requireMethod, ok, sql } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const limit  = Math.min(parseInt(req.query?.limit  ?? '20', 10), 100);
  const period = req.query?.period ?? 'all';

  const tail = `
    GROUP  BY u.id, u.username, u.display_name, u.flag, u.streak
    ORDER  BY best_score DESC, u.streak DESC, games_played DESC
    LIMIT  `;

  const selectFrom = `
    SELECT
        u.id,
        COALESCE(u.display_name, u.username) AS display_name,
        u.flag,
        MAX(sc.score)        AS best_score,
        COUNT(sc.id)         AS games_played,
        u.streak,
        MAX(sc.submitted_at) AS last_played
    FROM   scores sc
    JOIN   users  u ON u.id = sc.user_id
    `;

  let rows;

  if (period === 'today') {
    rows = await sql(
      [selectFrom + `WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date` + tail, ``],
      limit
    );
  } else if (period === 'week') {
    rows = await sql(
      [selectFrom + `WHERE  sc.submitted_at >= NOW() - INTERVAL '7 days'` + tail, ``],
      limit
    );
  } else {
    rows = await sql(
      [selectFrom + tail, ``],
      limit
    );
  }

  const leaderboard = rows.map((row, i) => ({
    rank:         i + 1,
    id:           Number(row.id),
    display_name: row.display_name,
    flag:         row.flag ?? '🏳️',
    best_score:   Number(row.best_score),
    games:        Number(row.games_played),
    streak:       Number(row.streak),
    last_played:  row.last_played,
  }));

  ok(res, { period, count: leaderboard.length, leaderboard });
}
