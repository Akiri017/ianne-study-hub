-- =============================================================================
-- Ianne's Study Hub — SQLite Schema
-- All tables use IF NOT EXISTS so this file is safe to exec on every startup.
-- Foreign key enforcement is enabled before this runs (see db/index.ts).
-- =============================================================================

-- 1. subjects
--    Root entity. Deleting a subject cascades to modules, weak_points, tasks.
CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. modules
--    One module per uploaded file. Belongs to a subject.
--    Deleting a module cascades to ai_outputs (handled below).
CREATE TABLE IF NOT EXISTS modules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  file_path  TEXT    NOT NULL,
  file_type  TEXT    NOT NULL,         -- 'pdf' | 'docx'
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 3. ai_outputs
--    Per-module AI-generated content (prescan, notes, single-module quiz draft).
--    Multi-module quizzes live in the quizzes table instead.
CREATE TABLE IF NOT EXISTS ai_outputs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id   INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  output_type TEXT    NOT NULL,        -- 'prescan' | 'notes' | 'quiz'
  content     TEXT    NOT NULL,        -- markdown or JSON string
  instructions TEXT,                   -- last regeneration instruction (nullable)
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 4. quizzes
--    Quizzes generated across one or more modules.
--    questions_json stores a serialized array of question objects.
CREATE TABLE IF NOT EXISTS quizzes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  question_count INTEGER NOT NULL,
  questions_json TEXT    NOT NULL,     -- JSON array of question objects
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 5. quiz_modules (junction)
--    Many-to-many between quizzes and modules.
--    Composite PK prevents duplicate entries.
--    Cascades on both sides so orphaned junction rows are never left behind.
CREATE TABLE IF NOT EXISTS quiz_modules (
  quiz_id   INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, module_id)
);

-- 6. fa_sessions
--    One row per Formative Assessment run against a quiz.
--    completed_at is NULL while the session is still in progress (resumable).
CREATE TABLE IF NOT EXISTS fa_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  answers_json TEXT    NOT NULL,   -- JSON array of { question_id, user_answer, correct }
  completed_at TEXT                -- NULL = in progress; ISO 8601 timestamp when done
);

-- 7. weak_points
--    Error Cards logged manually or auto-created from a failed FA question.
--    status lifecycle: Open → Patched → Confirmed (→ Open on regression)
CREATE TABLE IF NOT EXISTS weak_points (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic           TEXT    NOT NULL,
  what_went_wrong TEXT    NOT NULL,
  why_missed      TEXT    NOT NULL,
  fix             TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'Open',  -- 'Open' | 'Patched' | 'Confirmed'
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 8. tasks
--    subject_id is nullable — tasks can exist without a subject tag.
--    completed is stored as 0/1 integer (SQLite has no native boolean).
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,  -- nullable
  title      TEXT    NOT NULL,
  due_date   TEXT    NOT NULL,   -- YYYY-MM-DD
  completed  INTEGER NOT NULL DEFAULT 0
);

-- 9. subject_reviewers
--    Persists the most recent AI-generated reviewer for each subject.
--    One row per subject (UNIQUE). Upserted on every generate.
CREATE TABLE IF NOT EXISTS subject_reviewers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id   INTEGER NOT NULL UNIQUE REFERENCES subjects(id) ON DELETE CASCADE,
  content      TEXT    NOT NULL,
  generated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
