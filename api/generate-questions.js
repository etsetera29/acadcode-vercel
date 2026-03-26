// POST /api/generate-questions
// Called by Vercel Cron at midnight PHT (16:00 UTC) every day.
// Protected by CRON_SECRET env var.
// Uses Google Gemini API (free tier — no credit card required).
// Get your free key at: https://ai.google.dev

import { handleOptions, requireMethod, ok, err, sql } from './_helpers.js';

// ── Subject rotation (day-of-week in PHT) ────────────────────────
const SUBJECTS = {
  0: 'General Knowledge',
  1: 'Science',
  2: 'Mathematics',
  3: 'Computer Science',
  4: 'History & Social Studies',
  5: 'English & Literature',
  6: 'Arts & Culture',
};

// ── Prompt builder ───────────────────────────────────────────────
function buildPrompt(subject, dateStr) {
  return `You are an academic quiz generator. Generate exactly 10 multiple-choice questions about "${subject}" for ${dateStr}.

Requirements:
- Mix difficulty: 2 elementary, 3 middle-school, 3 high-school, 2 college level
- Each question must have exactly 4 options (A–D), only one correct
- Include a clear, educational explanation for the correct answer
- If a question involves code, include it in the "code" field (otherwise set to null)
- Keep questions factual, unambiguous, and curriculum-appropriate
- Vary the category within the subject (e.g. for Science: Physics, Chemistry, Biology, etc.)

Respond with ONLY a valid JSON array — no markdown fences, no preamble, no extra text. Each element:
{
  "category": "string",
  "text": "question text",
  "code": null,
  "options": ["option A", "option B", "option C", "option D"],
  "answer": 0,
  "explanation": "HTML-safe explanation string"
}`;
}

// ── Main handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  // Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return err(res, 'Unauthorized.', 401);
    }
  }

  // Determine today's date in PHT (UTC+8)
  const phtOffsetMs = 8 * 60 * 60 * 1000;
  const nowPhtMs    = Date.now() + phtOffsetMs;
  const phtDate     = new Date(nowPhtMs);
  const year        = phtDate.getUTCFullYear();
  const month       = String(phtDate.getUTCMonth() + 1).padStart(2, '0');
  const day         = String(phtDate.getUTCDate()).padStart(2, '0');
  const dateStr     = `${year}-${month}-${day}`;
  const dow         = phtDate.getUTCDay();
  const subject     = SUBJECTS[dow];

  // Idempotency — skip if questions for today already exist
  const existing = await sql`
    SELECT COUNT(*) AS cnt FROM questions WHERE question_date = ${dateStr}
  `;
  if (Number(existing[0].cnt) >= 10) {
    return ok(res, { message: 'Questions already generated for today.', date: dateStr, subject });
  }

  // Call Google Gemini API (free tier)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return err(res, 'GEMINI_API_KEY not configured.', 500);

  let questions;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(subject, dateStr) }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error('Gemini API error:', response.status, body);
      return err(res, 'AI generation failed. Try again later.', 502);
    }

    const data = await response.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip accidental markdown fences just in case
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    questions = JSON.parse(cleaned);

    if (!Array.isArray(questions) || questions.length < 10) {
      throw new Error(`Expected 10 questions, got ${questions?.length}`);
    }
  } catch (e) {
    console.error('Question parse error:', e);
    return err(res, 'Failed to parse AI response. Try again.', 502);
  }

  // Save to DB
  const saved = [];
  for (let i = 0; i < 10; i++) {
    const q = questions[i];
    await sql`
      INSERT INTO questions
        (question_date, subject, position, category, text, code, options, answer, explanation)
      VALUES
        (${dateStr}, ${subject}, ${i},
         ${q.category}, ${q.text}, ${q.code ?? null},
         ${JSON.stringify(q.options)}, ${q.answer}, ${q.explanation})
      ON CONFLICT (question_date, position) DO NOTHING
    `;
    saved.push(i);
  }

  return ok(res, {
    message: `Generated and saved ${saved.length} questions.`,
    date: dateStr,
    subject,
  });
}
