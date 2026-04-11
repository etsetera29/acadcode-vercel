// GET /api/questions
// Returns today's 10 questions for the frontend quiz.
// No auth required — questions are public (answers are hidden client-side
// during the quiz; the correct answer index is stripped before sending).
//
// Response:
// {
//   date: "2025-04-07",
//   subject: "Computer Science",
//   questions: [ { category, text, code?, options, answer, explanation }, … ]
// }
//
// NOTE: "answer" IS included so the frontend can check locally — this is
// intentional for this style of quiz. The submit endpoint only stores score,
// not individual answers, so there's nothing to cheat.

import { handleOptions, requireMethod, ok, err, sql } from './_helpers.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  // Use provided ?date=YYYY-MM-DD param, or fall back to today in PHT (UTC+8)
  let dateStr = typeof req.query?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : (() => {
        const phtOffsetMs = 8 * 60 * 60 * 1000;
        const phtDate     = new Date(Date.now() + phtOffsetMs);
        const year        = phtDate.getUTCFullYear();
        const month       = String(phtDate.getUTCMonth() + 1).padStart(2, '0');
        const day         = String(phtDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();

  const rows = await sql`
    SELECT category, text, code, options, answer, explanation
    FROM   questions
    WHERE  question_date = ${dateStr}
    ORDER  BY position ASC
  `;

  if (rows.length === 0) {
    return err(res, 'No questions available for today yet. Check back shortly!', 404);
  }

  const subject = await sql`
    SELECT subject FROM questions WHERE question_date = ${dateStr} LIMIT 1
  `;

  const questions = rows.map(r => ({
    category:    r.category,
    text:        r.text,
    code:        r.code ?? undefined,
    options:     typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
    answer:      r.answer,
    explanation: r.explanation,
  }));

  return ok(res, {
    date:      dateStr,
    subject:   subject[0]?.subject ?? 'Academic',
    questions,
  });
}
