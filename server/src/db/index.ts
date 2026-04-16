import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

// DB lives at the project root, not inside server/
const DB_PATH = path.resolve(__dirname, '../../../study-hub.db')

const db = new DatabaseSync(DB_PATH)

// Enable WAL mode for better concurrency and enforce FK constraints
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

// Run schema on startup — all CREATE TABLE statements use IF NOT EXISTS so this is safe
const schemaPath = path.resolve(__dirname, 'schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf-8')
db.exec(schema)

export default db
