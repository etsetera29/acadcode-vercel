// POST /api/generate-questions
// Called by Vercel Cron at midnight PHT (16:00 UTC) every day.
// Protected by CRON_SECRET env var.
// Uses Groq API (free tier — no credit card required).
// Get your free key at: https://console.groq.com

import { handleOptions, ok, err, sql } from './_helpers.js';

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

// How many days of history to check for repeated questions
const REPEAT_LOOKBACK_DAYS = 30;

/**
 * Fetch recent question texts and categories for the same subject
 * from the last REPEAT_LOOKBACK_DAYS days, to inject into the prompt
 * so the AI can explicitly avoid repeating them.
 */
async function fetchRecentQuestions(subject) {
  try {
    const rows = await sql`
      SELECT text, category
      FROM   questions
      WHERE  subject       = ${subject}
        AND  question_date >= (CURRENT_DATE - ${REPEAT_LOOKBACK_DAYS}::int)
      ORDER  BY question_date DESC
    `;
    return rows; // [{ text, category }, ...]
  } catch (e) {
    // Non-fatal — if this fails, generation still proceeds without the hint
    console.warn('Could not fetch recent questions for dedup:', e.message);
    return [];
  }
}

function buildPrompt(subject, dateStr, recentQuestions) {
  // Build a dedupe block only when there's history to share
  let dedupeBlock = '';
  if (recentQuestions.length > 0) {
    const listed = recentQuestions
      .map((q, i) => `${i + 1}. [${q.category}] ${q.text}`)
      .join('\n');
    dedupeBlock = `

IMPORTANT — Do NOT repeat or closely paraphrase any of the following questions that have already been used in the last ${REPEAT_LOOKBACK_DAYS} days. Vary the specific concepts, facts, and categories so learners always encounter fresh material:
<already_used>
${listed}
</already_used>`;
  }

  return `You are an academic quiz generator. Generate exactly 10 multiple-choice questions about "${subject}" for ${dateStr}.

Requirements:
- Mix difficulty: 2 elementary, 3 middle-school, 3 high-school, 2 college level
- Each question must have exactly 4 options (A–D), only one correct
- Include a clear, educational explanation for the correct answer
- If a question involves code, include it in the "code" field (otherwise set to null)
- Keep questions factual, unambiguous, and curriculum-appropriate
- Vary the category within the subject (e.g. for Science: Physics, Chemistry, Biology, etc.)
- Ensure every question covers a DISTINCT concept — no two questions should test the same fact or idea${dedupeBlock}

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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return err(res, 'Method not allowed.', 405);

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

  // Fetch recent questions for this subject to guide deduplication
  const recentQuestions = await fetchRecentQuestions(subject);

  // Call Groq API (free, no credit card, OpenAI-compatible)
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return err(res, 'GROQ_API_KEY not configured.', 500);

  let questions;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  4096,
        temperature: 0.85, // slightly higher temperature encourages more variety
        messages: [
          { role: 'user', content: buildPrompt(subject, dateStr, recentQuestions) }
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Groq API error:', response.status, body);
      return err(res, `Groq error ${response.status}: ${body}`, 502);
    }

    const data = await response.json();
    const raw  = data.choices?.[0]?.message?.content ?? '';

    // Strip accidental markdown fences just in case
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    questions = JSON.parse(cleaned);

    if (!Array.isArray(questions) || questions.length < 10) {
      throw new Error(`Expected 10 questions, got ${questions?.length}`);
    }
  } catch (e) {
    console.error('Question parse error:', e);
    return err(res, `Parse error: ${e.message}`, 502);
  }

  // Post-generation dedup guard: drop any generated question whose text
  // is suspiciously similar (>80% word overlap) to a recent one, and log it.
  const recentTexts = recentQuestions.map(q => q.text.toLowerCase());

  function wordOverlap(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const intersection = [...setA].filter(w => setB.has(w)).length;
    return intersection / Math.max(setA.size, setB.size);
  }

  const dedupedQuestions = [];
  const flagged = [];
  for (const q of questions) {
    const qLow = q.text.toLowerCase();
    const tooSimilar = recentTexts.some(r => wordOverlap(qLow, r) > 0.8);
    if (tooSimilar) {
      flagged.push(q.text);
      console.warn('Dedup: dropped near-duplicate question:', q.text);
    } else {
      dedupedQuestions.push(q);
    }
  }

  // If we lost too many to dedup, log a warning but still save what we have
  if (dedupedQuestions.length < 10) {
    console.warn(`Dedup removed ${flagged.length} question(s); only ${dedupedQuestions.length} unique remain.`);
  }

  // Save to DB (up to 10; positions are 0-indexed)
  const saved = [];
  for (let i = 0; i < Math.min(10, dedupedQuestions.length); i++) {
    const q = dedupedQuestions[i];
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
    message:  `Generated and saved ${saved.length} questions.`,
    date:     dateStr,
    subject,
    deduped:  flagged.length,
    ...(flagged.length > 0 && { flaggedQuestions: flagged }),
  });
}