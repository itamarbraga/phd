// functions/api/[[route]].js
// Cloudflare Pages Function — handles all /api/* routes
// Bound to D1 database "DB" via wrangler.toml

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url    = new URL(request.url);
  const route  = (params.route || []).join('/');
  const DB     = env.DB;
  const today  = new Date().toISOString().split('T')[0];

  // ── GET /api/stats ─────────────────────────────────────────────
  if (route === 'stats' && request.method === 'GET') {
    const [sessions, quizRow, pomRow] = await Promise.all([
      DB.prepare('SELECT SUM(minutes) as total_min, COUNT(*) as days_done FROM study_sessions WHERE completed=1').first(),
      DB.prepare('SELECT SUM(correct) as correct, COUNT(*) as total FROM quiz_answers').first(),
      DB.prepare('SELECT COUNT(*) as count FROM pomodoro_log WHERE date=? AND completed=1').bind(today).first(),
    ]);
    const acc = quizRow?.total ? Math.round((quizRow.correct / quizRow.total) * 100) : null;
    return json({ totalMinutes: sessions?.total_min || 0, daysDone: sessions?.days_done || 0, quizAccuracy: acc, todayPomodoros: pomRow?.count || 0 });
  }

  // ── GET /api/daily ─────────────────────────────────────────────
  if (route === 'daily' && request.method === 'GET') {
    const date = url.searchParams.get('date') || today;
    const [pomo, quiz, session] = await Promise.all([
      DB.prepare('SELECT SUM(duration_minutes) as mins FROM pomodoro_log WHERE date=? AND completed=1').bind(date).first(),
      DB.prepare('SELECT SUM(correct) as correct, COUNT(*) as total FROM quiz_answers WHERE date(answered_at)=?').bind(date).first(),
      DB.prepare('SELECT * FROM study_sessions WHERE date=? ORDER BY created_at DESC LIMIT 1').bind(date).first(),
    ]);
    const studyMins = (session?.minutes || 0) + (pomo?.mins || 0);
    return json({ date, studyMinutes: studyMins, pomodoros: pomo?.mins ? Math.floor(pomo.mins / 25) : 0, quizCorrect: quiz?.correct || 0, quizTotal: quiz?.total || 0, dayCompleted: session?.completed || 0 });
  }

  // ── POST /api/session ──────────────────────────────────────────
  if (route === 'session' && request.method === 'POST') {
    const body = await request.json();
    const { date = today, day_num, topic, minutes = 0, completed = 0 } = body;
    await DB.prepare(
      'INSERT INTO study_sessions (date, day_num, topic, minutes, completed) VALUES (?, ?, ?, ?, ?)'
    ).bind(date, day_num, topic, minutes, completed ? 1 : 0).run();
    return json({ ok: true });
  }

  // ── GET /api/sessions ──────────────────────────────────────────
  if (route === 'sessions' && request.method === 'GET') {
    const rows = await DB.prepare('SELECT * FROM study_sessions ORDER BY date DESC').all();
    return json(rows.results || []);
  }

  // ── POST /api/quiz ─────────────────────────────────────────────
  if (route === 'quiz' && request.method === 'POST') {
    const body = await request.json();
    const { question_id, category, correct, prev_interval = 1, prev_ease = 2.5, prev_reps = 0 } = body;
    if (!question_id || correct === undefined) return err('Missing fields');

    // SM-2 algorithm
    let interval = prev_interval;
    let ease     = prev_ease;
    let reps     = prev_reps;
    const grade  = correct ? 5 : 2; // simplified: correct=5, wrong=2

    if (grade >= 3) {
      if (reps === 0)      interval = 1;
      else if (reps === 1) interval = 6;
      else                 interval = Math.round(interval * ease);
      reps += 1;
    } else {
      reps = 0; interval = 1;
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

    const next = new Date();
    next.setDate(next.getDate() + interval);
    const next_review = next.toISOString().split('T')[0];

    await DB.prepare(
      'INSERT INTO quiz_answers (question_id, category, correct, interval_days, ease_factor, repetitions, next_review) VALUES (?,?,?,?,?,?,?)'
    ).bind(question_id, category, correct ? 1 : 0, interval, ease, reps, next_review).run();

    return json({ ok: true, next_review, interval, ease, reps });
  }

  // ── GET /api/quiz/stats ────────────────────────────────────────
  if (route === 'quiz/stats' && request.method === 'GET') {
    const rows = await DB.prepare(`
      SELECT question_id, category,
        SUM(correct) as correct_count,
        COUNT(*) as total_attempts,
        MAX(interval_days) as current_interval,
        MAX(ease_factor) as ease,
        MAX(repetitions) as reps,
        MAX(next_review) as next_review,
        MAX(answered_at) as last_answered
      FROM quiz_answers
      GROUP BY question_id
    `).all();
    return json(rows.results || []);
  }

  // ── GET /api/quiz/due ──────────────────────────────────────────
  if (route === 'quiz/due' && request.method === 'GET') {
    const cat = url.searchParams.get('cat') || '';
    const catWhere = cat ? "AND category='" + cat.replace(/'/g, "''") + "'" : '';
    const rows = await DB.prepare(`
      SELECT question_id, MAX(next_review) as next_review, MAX(repetitions) as reps,
             SUM(correct) as correct, COUNT(*) as attempts
      FROM quiz_answers
      WHERE 1=1 ${catWhere}
      GROUP BY question_id
      HAVING next_review <= date('now') OR reps = 0
    `).all();
    return json(rows.results || []);
  }

  // ── POST /api/reading ──────────────────────────────────────────
  if (route === 'reading' && request.method === 'POST') {
    const body = await request.json();
    const { paper_num, status, quiz_attempts, quiz_best_pct, notes } = body;
    if (!paper_num) return err('paper_num required');
    await DB.prepare(`
      INSERT INTO reading_progress (paper_num, status, quiz_attempts, quiz_best_pct, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(paper_num) DO UPDATE SET
        status        = excluded.status,
        quiz_attempts = excluded.quiz_attempts,
        quiz_best_pct = excluded.quiz_best_pct,
        notes         = excluded.notes,
        updated_at    = excluded.updated_at
    `).bind(paper_num, status || 'reading', quiz_attempts || 0, quiz_best_pct || 0, notes || '').run();
    return json({ ok: true });
  }

  // ── GET /api/reading ───────────────────────────────────────────
  if (route === 'reading' && request.method === 'GET') {
    const rows = await DB.prepare('SELECT * FROM reading_progress ORDER BY paper_num').all();
    return json(rows.results || []);
  }

  // ── POST /api/pomodoro ─────────────────────────────────────────
  if (route === 'pomodoro' && request.method === 'POST') {
    const body = await request.json();
    const { date = today, duration_minutes = 25, topic = '', completed = 1 } = body;
    await DB.prepare(
      'INSERT INTO pomodoro_log (date, duration_minutes, topic, completed) VALUES (?,?,?,?)'
    ).bind(date, duration_minutes, topic, completed ? 1 : 0).run();
    return json({ ok: true });
  }

  // ── GET /api/leaderboard (streaks / progress overview) ─────────
  if (route === 'leaderboard' && request.method === 'GET') {
    const [sessions, byDay] = await Promise.all([
      DB.prepare('SELECT date, SUM(minutes) as mins, MAX(completed) as done FROM study_sessions GROUP BY date ORDER BY date ASC').all(),
      DB.prepare('SELECT date(answered_at) as d, SUM(correct) as c, COUNT(*) as t FROM quiz_answers GROUP BY d ORDER BY d ASC').all(),
    ]);
    return json({ sessions: sessions.results || [], quiz: byDay.results || [] });
  }

  return err('Not found', 404);
}
