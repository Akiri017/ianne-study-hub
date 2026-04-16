import type { DatabaseSync } from 'node:sqlite'

/**
 * Migration 001 — Initial Schema
 *
 * The full schema is applied idempotently in db/index.ts on every server
 * startup via schema.sql. This migration record exists to document the
 * initial database state and to anchor the migration sequence for any
 * future incremental migrations (002, 003, ...).
 *
 * When a migration runner is added, it should check this record first and
 * skip execution if it already appears in the migrations ledger table.
 */
export const migration = {
  id: '001',
  name: 'initial_schema',
  up: (_db: DatabaseSync) => {
    // Schema is initialized in db/index.ts on startup via schema.sql.
    // This migration record exists to document the initial state.
  },
}
