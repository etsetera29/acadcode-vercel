// GET /api/leaderboard
// Public. Query: ?period=all|week|today  &limit=20

import { handleOptions, requireMethod, ok, sql } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const limit  = Math.min(parseInt(req.query?.limit  ?? '20', 10), 100);
  const period = req.query?.period ?? 'all';

  // neon() is a tagged template function. Calling sql(stringsArray, ...values)
  // is identical to the sql`...` syntax, letting us build queries dynamically
  // without unsupported fragment interpolation.

  const tail = `
    GROUP  BY u.id, u.username, u.streak
    ORDER  BY best_score DESC, u.streak DESC, games_played DESC
    LIMIT  `;  // $1 will be appended as the interpolated value

  const selectFrom = `
    SELECT
        u.id,
        u.username,
        MAX(sc.score)        AS best_score,
        COUNT(sc.id)         AS games_played,
        u.streak,
        MAX(sc.submitted_at) AS last_played
    FROM   scores sc
    JOIN   users  u ON u.id = sc.user_id
    `;

  let rows;

  if (period === 'today') {
    // sql`${selectFrom}WHERE sc.submitted_at::date = CURRENT_DATE${tail}${limit}`
    rows = await sql(
      [selectFrom + `WHERE  sc.submitted_at::date = CURRENT_DATE` + tail, ``],
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
    rank:        i + 1,
    id:          Number(row.id),
    username:    row.username,
    best_score:  Number(row.best_score),
    games:       Number(row.games_played),
    streak:      Number(row.streak),
    last_played: row.last_played,
  }));

  ok(res, { period, count: leaderboard.length, leaderboard });
}
