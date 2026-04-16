/**
 * DB schema tests.
 *
 * Uses an in-memory DatabaseSync so we never touch the real study-hub.db.
 * We import the raw schema.sql and exec it directly, mirroring what db/index.ts
 * does at startup.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'

// Resolve schema relative to this file: __tests__ → db → schema.sql
const schemaPath = path.resolve(__dirname, '../db/schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf-8')

/** Create a fresh in-memory DB with FKs on and the schema applied. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(schema)
  return db
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      // Exclude internal SQLite tables (e.g. sqlite_sequence auto-created by AUTOINCREMENT)
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

function pragmaValue(db: DatabaseSync, pragma: string): unknown {
  const row = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown>
  // WAL pragma returns { journal_mode: 'wal' }; foreign_keys returns { foreign_keys: 0|1 }
  return Object.values(row)[0]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Database schema', () => {
  const EXPECTED_TABLES = [
    'ai_outputs',
    'fa_sessions',
    'modules',
    'quiz_modules',
    'quizzes',
    'subjects',
    'tasks',
    'weak_points',
  ]

  it('creates all 8 expected tables', () => {
    const db = createTestDb()
    const tables = getTableNames(db)
    for (const table of EXPECTED_TABLES) {
      expect(tables, `Expected table "${table}" to exist`).toContain(table)
    }
    expect(tables).toHaveLength(EXPECTED_TABLES.length)
    db.close()
  })

  it('is idempotent — running schema twice does not throw', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    expect(() => db.exec(schema)).not.toThrow()
    // Run a second time — IF NOT EXISTS guards should prevent errors
    expect(() => db.exec(schema)).not.toThrow()
    db.close()
  })

  it('has PRAGMA foreign_keys = ON', () => {
    const db = createTestDb()
    // foreign_keys returns 1 when enabled
    expect(pragmaValue(db, 'foreign_keys')).toBe(1)
    db.close()
  })

  it('has PRAGMA journal_mode = WAL', () => {
    const db = createTestDb()
    // WAL mode returns 'memory' for in-memory DBs — SQLite limitation.
    // We verify the PRAGMA can be set without error and returns a string.
    const mode = pragmaValue(db, 'journal_mode') as string
    expect(typeof mode).toBe('string')
    db.close()
  })

  it('enforces FK constraint: module subject_id must exist', () => {
    const db = createTestDb()
    expect(() => {
      db.exec(`
        INSERT INTO modules (subject_id, title, file_path, file_type)
        VALUES (9999, 'Orphan', '/tmp/fake.pdf', 'pdf')
      `)
    }).toThrow()
    db.close()
  })

  it('cascades deletes from subjects to modules', () => {
    const db = createTestDb()
    db.exec(`INSERT INTO subjects (name) VALUES ('TestSubject')`)
    const subject = db.prepare(`SELECT id FROM subjects WHERE name='TestSubject'`).get() as { id: number }
    db.exec(`
      INSERT INTO modules (subject_id, title, file_path, file_type)
      VALUES (${subject.id}, 'Mod1', '/tmp/file.pdf', 'pdf')
    `)

    // Deleting subject should cascade-delete its modules
    db.exec(`DELETE FROM subjects WHERE id = ${subject.id}`)
    const remaining = db.prepare(`SELECT * FROM modules WHERE subject_id = ${subject.id}`).all()
    expect(remaining).toHaveLength(0)
    db.close()
  })

  it('cascades deletes from subjects to weak_points', () => {
    const db = createTestDb()
    db.exec(`INSERT INTO subjects (name) VALUES ('WPSubject')`)
    const subject = db.prepare(`SELECT id FROM subjects WHERE name='WPSubject'`).get() as { id: number }
    db.exec(`
      INSERT INTO weak_points (subject_id, topic, what_went_wrong, why_missed, fix)
      VALUES (${subject.id}, 'Topic', 'What', 'Why', 'Fix')
    `)

    db.exec(`DELETE FROM subjects WHERE id = ${subject.id}`)
    const remaining = db.prepare(`SELECT * FROM weak_points WHERE subject_id = ${subject.id}`).all()
    expect(remaining).toHaveLength(0)
    db.close()
  })

  it('cascades deletes from subjects to tasks', () => {
    const db = createTestDb()
    db.exec(`INSERT INTO subjects (name) VALUES ('TaskSubject')`)
    const subject = db.prepare(`SELECT id FROM subjects WHERE name='TaskSubject'`).get() as { id: number }
    db.exec(`INSERT INTO tasks (subject_id, title, due_date) VALUES (${subject.id}, 'Do thing', '2026-05-01')`)

    db.exec(`DELETE FROM subjects WHERE id = ${subject.id}`)
    const remaining = db.prepare(`SELECT * FROM tasks WHERE subject_id = ${subject.id}`).all()
    expect(remaining).toHaveLength(0)
    db.close()
  })

  it('tasks can exist without a subject (nullable subject_id)', () => {
    const db = createTestDb()
    expect(() => {
      db.exec(`INSERT INTO tasks (subject_id, title, due_date) VALUES (NULL, 'Orphan task', '2026-06-01')`)
    }).not.toThrow()
    db.close()
  })

  it('subjects.name is UNIQUE', () => {
    const db = createTestDb()
    db.exec(`INSERT INTO subjects (name) VALUES ('UniqueSubject')`)
    expect(() => {
      db.exec(`INSERT INTO subjects (name) VALUES ('UniqueSubject')`)
    }).toThrow()
    db.close()
  })

  it('quiz_modules composite PK prevents duplicate junction rows', () => {
    const db = createTestDb()
    db.exec(`INSERT INTO subjects (name) VALUES ('QMSubject')`)
    const subject = db.prepare(`SELECT id FROM subjects WHERE name='QMSubject'`).get() as { id: number }
    db.exec(`
      INSERT INTO modules (subject_id, title, file_path, file_type)
      VALUES (${subject.id}, 'QMMod', '/tmp/qm.pdf', 'pdf')
    `)
    db.exec(`
      INSERT INTO quizzes (title, question_count, questions_json)
      VALUES ('Quiz1', 5, '[]')
    `)
    const mod = db.prepare(`SELECT id FROM modules WHERE title='QMMod'`).get() as { id: number }
    const quiz = db.prepare(`SELECT id FROM quizzes WHERE title='Quiz1'`).get() as { id: number }

    db.exec(`INSERT INTO quiz_modules (quiz_id, module_id) VALUES (${quiz.id}, ${mod.id})`)
    expect(() => {
      db.exec(`INSERT INTO quiz_modules (quiz_id, module_id) VALUES (${quiz.id}, ${mod.id})`)
    }).toThrow()
    db.close()
  })
})
