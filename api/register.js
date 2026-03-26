// POST /api/register
// Body: { "username": "…", "email": "…", "password": "…", "flag": "🇵🇭",
//         "year_level": "college", "track_course": "College of Computer Studies" }
// Returns: { "message": "…", "user": {…} }

import { handleOptions, requireMethod, getBody, ok, err,
         sql, bcrypt } from './_helpers.js';

const VALID_YEAR_LEVELS = ['elementary', 'junior_high', 'senior_high', 'college'];

const SENIOR_HIGH_TRACKS = [
  'Senior High School (Technical-Vocational)',
  'Senior High School (Information and Communication Technology)',
  'Senior High School (Agriculture and Fishery Arts)',
  'Senior High School (Arts and Design)',
];

const COLLEGE_COURSES = [
  'College of Accountancy',
  'College of Allied Medical Sciences',
  'College of Business Management',
  'College of Criminal Justice',
  'College of Education',
  'College of Computer Studies',
  'College of Arts and Sciences',
  'College of Engineering',
];

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  const body         = getBody(req);
  const uname        = (body.username     ?? '').trim();
  const email        = (body.email        ?? '').trim();
  const password     = body.password      ?? '';
  const flag         = (body.flag         ?? '🏳️').trim();
  const year_level   = (body.year_level   ?? '').trim();
  const track_course = (body.track_course ?? '').trim() || null;

  if (uname.length < 2 || uname.length > 24)
    return err(res, 'Username must be 2–24 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err(res, 'Invalid email address.');
  if (password.length < 6)
    return err(res, 'Password must be at least 6 characters.');
  if (!VALID_YEAR_LEVELS.includes(year_level))
    return err(res, 'Please select a valid year level.');

  if (year_level === 'senior_high') {
    if (!track_course || !SENIOR_HIGH_TRACKS.includes(track_course))
      return err(res, 'Please select a valid Senior High track.');
  } else if (year_level === 'college') {
    if (!track_course || !COLLEGE_COURSES.includes(track_course))
      return err(res, 'Please select a valid college course.');
  }

  const existing = await sql`
    SELECT id FROM users WHERE username = ${uname} OR email = ${email}
  `;
  if (existing.length) return err(res, 'Username or email already in use.', 409);

  const hash = await bcrypt.hash(password, 10);
  const result = await sql`
    INSERT INTO users (username, display_name, email, password_hash, flag, year_level, track_course, created_at)
    VALUES (${uname}, ${uname}, ${email}, ${hash}, ${flag}, ${year_level}, ${track_course}, NOW())
    RETURNING id
  `;

  ok(res, {
    message: 'Account created successfully.',
    user: { id: result[0].id, username: uname, display_name: uname, email, flag, year_level, track_course },
  }, 201);
}
