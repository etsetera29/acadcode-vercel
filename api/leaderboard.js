// GET /api/leaderboard
// Public. Query: ?period=all|month|today  &limit=20  &year_level=<filter>
//
// Ranking logic:
//   today   → best_score DESC (tiebreak: streak DESC, games DESC)
//   month   → top1_count DESC (# of daily #1 finishes), tiebreak best_score DESC
//   all     → top1_count DESC (# of daily #1 finishes), tiebreak best_score DESC

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

  if (period === 'today') {
    // Daily: rank by best score today
    if (yl_filter) {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.year_level, u.track_course,
               MAX(sc.score)          AS best_score,
               COUNT(sc.id)           AS games_played,
               u.streak,
               MAX(sc.submitted_at)   AS last_played,
               0                      AS top1_count
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
               MAX(sc.submitted_at)   AS last_played,
               0                      AS top1_count
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
               = (NOW() AT TIME ZONE 'Asia/Manila')::date
        GROUP  BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, u.streak DESC, games_played DESC
        LIMIT  ${limit}
      `;
    }
  } else if (period === 'month') {
    // Monthly: rank by number of daily #1 finishes this month
    // Ties on a given day ALL count as #1 (same top score = all get +1)
    if (yl_filter) {
      rows = await sql`
        WITH daily_best AS (
          SELECT
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS top_score
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE sc.submitted_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
            AND u.year_level = ${yl_filter}
          GROUP BY day
        ),
        user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS day_score
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE sc.submitted_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
            AND u.year_level = ${yl_filter}
          GROUP BY sc.user_id, day
        ),
        top1_counts AS (
          SELECT ud.user_id, COUNT(*) AS top1_count
          FROM user_daily ud
          JOIN daily_best db ON ud.day = db.day AND ud.day_score = db.top_score
          GROUP BY ud.user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.year_level, u.track_course,
          MAX(sc.score)          AS best_score,
          COUNT(sc.id)           AS games_played,
          u.streak,
          MAX(sc.submitted_at)   AS last_played,
          COALESCE(t.top1_count, 0) AS top1_count
        FROM scores sc
        JOIN users u ON u.id = sc.user_id
        LEFT JOIN top1_counts t ON t.user_id = u.id
        WHERE sc.submitted_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
          AND u.year_level = ${yl_filter}
        GROUP BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        WITH daily_best AS (
          SELECT
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS top_score
          FROM scores sc
          GROUP BY day
        ),
        user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS day_score
          FROM scores sc
          GROUP BY sc.user_id, day
        ),
        top1_counts AS (
          SELECT ud.user_id, COUNT(*) AS top1_count
          FROM user_daily ud
          JOIN daily_best db ON ud.day = db.day AND ud.day_score = db.top_score
          GROUP BY ud.user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.year_level, u.track_course,
          MAX(sc.score)          AS best_score,
          COUNT(sc.id)           AS games_played,
          u.streak,
          MAX(sc.submitted_at)   AS last_played,
          COALESCE(t.top1_count, 0) AS top1_count
        FROM scores sc
        JOIN users u ON u.id = sc.user_id
        LEFT JOIN top1_counts t ON t.user_id = u.id
        WHERE sc.submitted_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
        GROUP BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    }
  } else {
    // All time: rank by number of daily #1 finishes ever
    if (yl_filter) {
      rows = await sql`
        WITH daily_best AS (
          SELECT
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS top_score
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE u.year_level = ${yl_filter}
          GROUP BY day
        ),
        user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS day_score
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE u.year_level = ${yl_filter}
          GROUP BY sc.user_id, day
        ),
        top1_counts AS (
          SELECT ud.user_id, COUNT(*) AS top1_count
          FROM user_daily ud
          JOIN daily_best db ON ud.day = db.day AND ud.day_score = db.top_score
          GROUP BY ud.user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.year_level, u.track_course,
          MAX(sc.score)          AS best_score,
          COUNT(sc.id)           AS games_played,
          u.streak,
          MAX(sc.submitted_at)   AS last_played,
          COALESCE(t.top1_count, 0) AS top1_count
        FROM scores sc
        JOIN users u ON u.id = sc.user_id
        LEFT JOIN top1_counts t ON t.user_id = u.id
        WHERE u.year_level = ${yl_filter}
        GROUP BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        WITH daily_best AS (
          SELECT
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS top_score
          FROM scores sc
          GROUP BY day
        ),
        user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score) AS day_score
          FROM scores sc
          GROUP BY sc.user_id, day
        ),
        top1_counts AS (
          SELECT ud.user_id, COUNT(*) AS top1_count
          FROM user_daily ud
          JOIN daily_best db ON ud.day = db.day AND ud.day_score = db.top_score
          GROUP BY ud.user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.year_level, u.track_course,
          MAX(sc.score)          AS best_score,
          COUNT(sc.id)           AS games_played,
          u.streak,
          MAX(sc.submitted_at)   AS last_played,
          COALESCE(t.top1_count, 0) AS top1_count
        FROM scores sc
        JOIN users u ON u.id = sc.user_id
        LEFT JOIN top1_counts t ON t.user_id = u.id
        GROUP BY u.id, u.username, u.display_name, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
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
    top1_count:   Number(row.top1_count ?? 0),
  }));

  ok(res, { period, count: leaderboard.length, leaderboard });
}
