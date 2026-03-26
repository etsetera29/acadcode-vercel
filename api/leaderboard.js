// GET /api/leaderboard
// Public. Query: ?period=all|week|today  &limit=20  &year_level=<filter>

import { handleOptions, requireMethod, ok, sql } from './_helpers.js';

const VALID_YEAR_LEVELS = ['elementary', 'junior_high', 'senior_high', 'college'];

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const limit     = Math.min(parseInt(req.query?.limit ?? '20', 10), 100);
  const period    = req.query?.period ?? 'all';
  const ylRaw     = req.query?.year_level ?? '';
  const yl_filter = VALID_YEAR_LEVELS.includes(ylRaw) ? ylRaw : null;

  let rows;

  // 12 branches: 3 periods × (no filter | 4 year levels)
  // Using proper parameterized tagged-template queries throughout.
  if (period === 'today') {
    if (yl_filter) {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
               = (NOW() AT TIME ZONE 'Asia/Manila')::date
          AND  u.year_level = ${yl_filter}
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    } else {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
               = (NOW() AT TIME ZONE 'Asia/Manila')::date
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    }
  } else if (period === 'week') {
    if (yl_filter) {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  sc.submitted_at >= NOW() - INTERVAL '7 days'
          AND  u.year_level = ${yl_filter}
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    } else {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  sc.submitted_at >= NOW() - INTERVAL '7 days'
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    }
  } else {
    // all time
    if (yl_filter) {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  u.year_level = ${yl_filter}
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    } else {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    }
  }

  const leaderboard = rows.map((row, i) => ({
    rank:         i + 1,
    id:           Number(row.id),
    display_name: row.display_name,
    year_level:   row.year_level ?? 'college',
    track_course: row.track_course ?? null,
    best_score:   Number(row.best_score),
    games:        Number(row.games_played),
    streak:       Number(row.streak),
    last_played:  row.last_played,
  }));

  ok(res, { period, count: leaderboard.length, leaderboard });
}
