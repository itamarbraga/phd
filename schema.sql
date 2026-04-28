-- PhD Defense Prep — Cloudflare D1 Schema
-- Run: wrangler d1 execute phd-defense-db --file=schema.sql

CREATE TABLE IF NOT EXISTS study_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  day_num     INTEGER,
  topic       TEXT,
  minutes     INTEGER DEFAULT 0,
  completed   INTEGER DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  TEXT    NOT NULL,
  category     TEXT    NOT NULL,
  correct      INTEGER NOT NULL,          -- 1 or 0
  -- SM-2 spaced repetition fields
  interval_days REAL   DEFAULT 1,
  ease_factor   REAL   DEFAULT 2.5,
  repetitions   INTEGER DEFAULT 0,
  next_review   TEXT,                     -- ISO date string
  answered_at   TEXT    DEFAULT (datetime('now'))
);

-- One row per paper; upserted on each status change
CREATE TABLE IF NOT EXISTS reading_progress (
  paper_num      INTEGER PRIMARY KEY,
  status         TEXT    DEFAULT 'unread', -- unread | reading | done
  quiz_attempts  INTEGER DEFAULT 0,
  quiz_best_pct  INTEGER DEFAULT 0,
  notes          TEXT,
  updated_at     TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pomodoro_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  date             TEXT    NOT NULL,
  duration_minutes INTEGER DEFAULT 25,
  topic            TEXT,
  completed        INTEGER DEFAULT 1,
  logged_at        TEXT    DEFAULT (datetime('now'))
);

-- Aggregate cache — updated by the API to avoid expensive JOINs
CREATE TABLE IF NOT EXISTS daily_stats (
  date               TEXT    PRIMARY KEY,
  total_study_min    INTEGER DEFAULT 0,
  pomodoros_done     INTEGER DEFAULT 0,
  quiz_correct       INTEGER DEFAULT 0,
  quiz_total         INTEGER DEFAULT 0,
  day_completed      INTEGER DEFAULT 0,
  updated_at         TEXT    DEFAULT (datetime('now'))
);
