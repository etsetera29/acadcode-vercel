// GET  /api/subject-insights   — fetch cached insights
// POST /api/subject-insights   — recompute insights (cron at midnight PHT)

import { handleOptions, ok, err, sql } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  // ── GET: return cached insights ───────────────────────────────────
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT subject, year_level, track_course, avg_score, player_count, computed_at
      FROM   subject_insights
      ORDER  BY subject ASC, avg_score DESC
    `;

    // Group by subject
    const bySubject = {};
    for (const r of rows) {
      if (!bySubject[r.subject]) bySubject[r.subject] = [];
      bySubject[r.subject].push({
        year_level:   r.year_level,
        track_course: r.track_course,
        avg_score:    parseFloat(r.avg_score),
        player_count: Number(r.player_count),
      });
    }

    const insights = Object.entries(bySubject).map(([subject, groups]) => {
      const sorted = groups.sort((a, b) => b.avg_score - a.avg_score);
      return {
        subject,
        groups:     sorted,
        top_group:  sorted[0] ?? null,
        computed_at: rows.find(r => r.subject === subject)?.computed_at ?? null,
      };
    });

    return ok(res, { insights });
  }

  // ── POST: recompute insights ──────────────────────────────────────
  if (req.method === 'POST') {
    const computed = await sql`
      SELECT
        q.subject,
        u.year_level,
        u.track_course,
        ROUND(AVG(sc.score)::numeric, 2)    AS avg_score,
        COUNT(DISTINCT sc.user_id)::int     AS player_count
      FROM scores sc
      JOIN users u ON u.id = sc.user_id
      JOIN questions q
        ON (sc.submitted_at AT TIME ZONE 'Asia/Manila')::date
         = (q.question_date AT TIME ZONE 'Asia/Manila')::date
      GROUP BY q.subject, u.year_level, u.track_course
      HAVING COUNT(DISTINCT sc.user_id) >= 1
    `;

    if (computed.length === 0) {
      return ok(res, { message: 'No data to compute yet.', upserted: 0 });
    }

    // Delete existing rows and re-insert — avoids COALESCE in conflict target
    await sql`DELETE FROM subject_insights`;

    for (const row of computed) {
      const tc = row.track_course ?? null;
      await sql`
        INSERT INTO subject_insights
          (subject, year_level, track_course, avg_score, player_count, computed_at)
        VALUES
          (${row.subject}, ${row.year_level}, ${tc},
           ${row.avg_score}, ${row.player_count}, NOW())
      `;
    }

    return ok(res, { message: 'Insights recomputed.', upserted: computed.length });
  }

  return err(res, 'Method not allowed.', 405);
}
