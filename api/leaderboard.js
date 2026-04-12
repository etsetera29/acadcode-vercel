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
               u.flag,
               u.year_level, u.track_course,
               MAX(sc.score)              AS best_score,
               COUNT(sc.id)               AS games_played,
               u.streak,
               MAX(sc.submitted_at)       AS last_played,
               0                          AS top1_count,
               MIN(sc.time_taken_seconds) AS time_taken_seconds
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
               = (NOW() AT TIME ZONE 'Asia/Manila')::date
          AND  u.year_level = ${yl_filter}
        GROUP  BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, time_taken_seconds ASC, last_played ASC
        LIMIT  ${limit}
      `;
    } else {
      rows = await sql`
        SELECT u.id,
               COALESCE(u.display_name, u.username) AS display_name,
               u.flag,
               u.year_level, u.track_course,
               MAX(sc.score)              AS best_score,
               COUNT(sc.id)               AS games_played,
               u.streak,
               MAX(sc.submitted_at)       AS last_played,
               0                          AS top1_count,
               MIN(sc.time_taken_seconds) AS time_taken_seconds
        FROM   scores sc
        JOIN   users  u ON u.id = sc.user_id
        WHERE  (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
               = (NOW() AT TIME ZONE 'Asia/Manila')::date
        GROUP  BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course
        ORDER  BY best_score DESC, time_taken_seconds ASC, last_played ASC
        LIMIT  ${limit}
      `;
    }
  } else if (period === 'month') {
    // Monthly: rank by number of daily #1 finishes this month
    // #1 = highest score that day; ties broken by fastest time_taken_seconds (only ONE true #1 per day)
    if (yl_filter) {
      rows = await sql`
        WITH user_daily AS (
          -- Best score + fastest time per user per day
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score)              AS day_score,
            MIN(sc.time_taken_seconds) AS day_time
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE sc.submitted_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
            AND u.year_level = ${yl_filter}
          GROUP BY sc.user_id, day
        ),
        daily_winner AS (
          -- The single true #1 per day: top score, then fastest time, then earliest submission as final tiebreak
          SELECT DISTINCT ON (day)
            day,
            user_id
          FROM user_daily
          ORDER BY day, day_score DESC, day_time ASC
        ),
        top1_counts AS (
          SELECT user_id, COUNT(*) AS top1_count
          FROM daily_winner
          GROUP BY user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.flag,
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
        GROUP BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        WITH user_daily AS (
          -- Best score + fastest time per user per day
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score)              AS day_score,
            MIN(sc.time_taken_seconds) AS day_time
          FROM scores sc
          GROUP BY sc.user_id, day
        ),
        daily_winner AS (
          -- The single true #1 per day: top score, then fastest time
          SELECT DISTINCT ON (day)
            day,
            user_id
          FROM user_daily
          ORDER BY day, day_score DESC, day_time ASC
        ),
        top1_counts AS (
          SELECT user_id, COUNT(*) AS top1_count
          FROM daily_winner
          GROUP BY user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.flag,
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
        GROUP BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    }
  } else {
    // All time: rank by number of daily #1 finishes ever
    // #1 = highest score that day; ties broken by fastest time_taken_seconds (only ONE true #1 per day)
    if (yl_filter) {
      rows = await sql`
        WITH user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score)              AS day_score,
            MIN(sc.time_taken_seconds) AS day_time
          FROM scores sc
          JOIN users u ON u.id = sc.user_id
          WHERE u.year_level = ${yl_filter}
          GROUP BY sc.user_id, day
        ),
        daily_winner AS (
          SELECT DISTINCT ON (day)
            day,
            user_id
          FROM user_daily
          ORDER BY day, day_score DESC, day_time ASC
        ),
        top1_counts AS (
          SELECT user_id, COUNT(*) AS top1_count
          FROM daily_winner
          GROUP BY user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.flag,
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
        GROUP BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        WITH user_daily AS (
          SELECT
            sc.user_id,
            (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date AS day,
            MAX(sc.score)              AS day_score,
            MIN(sc.time_taken_seconds) AS day_time
          FROM scores sc
          GROUP BY sc.user_id, day
        ),
        daily_winner AS (
          SELECT DISTINCT ON (day)
            day,
            user_id
          FROM user_daily
          ORDER BY day, day_score DESC, day_time ASC
        ),
        top1_counts AS (
          SELECT user_id, COUNT(*) AS top1_count
          FROM daily_winner
          GROUP BY user_id
        )
        SELECT
          u.id,
          COALESCE(u.display_name, u.username) AS display_name,
          u.flag,
          u.year_level, u.track_course,
          MAX(sc.score)          AS best_score,
          COUNT(sc.id)           AS games_played,
          u.streak,
          MAX(sc.submitted_at)   AS last_played,
          COALESCE(t.top1_count, 0) AS top1_count
        FROM scores sc
        JOIN users u ON u.id = sc.user_id
        LEFT JOIN top1_counts t ON t.user_id = u.id
        GROUP BY u.id, u.username, u.display_name, u.flag, u.streak, u.year_level, u.track_course, t.top1_count
        ORDER BY top1_count DESC, best_score DESC, u.streak DESC
        LIMIT ${limit}
      `;
    }
  }

  const leaderboard = rows.map((row, i) => ({
    rank:               i + 1,
    id:                 Number(row.id),
    display_name:       row.display_name,
    flag:               row.flag ?? '🐭',
    year_level:         row.year_level ?? 'college',
    track_course:       row.track_course ?? null,
    best_score:         Number(row.best_score),
    games:              Number(row.games_played),
    streak:             Number(row.streak),
    last_played:        row.last_played,
    top1_count:         Number(row.top1_count ?? 0),
    time_taken_seconds: row.time_taken_seconds != null ? Number(row.time_taken_seconds) : null,
  }));

  ok(res, { period, count: leaderboard.length, leaderboard });
}
