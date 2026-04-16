# Ianne's Study Hub — Development Progress

**Started:** April 16, 2026  
**Status:** In progress — Session 1 complete

---

## Completed Tasks

- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind + design tokens, Express bootstrap, SQLite singleton, `.env.example`, `.gitignore`
- [x] Database schema — `schema.sql` with all 8 tables, FK constraints, cascade deletes; auto-runs on server start via `db.exec()`; migration stub `001_initial_schema.ts`
- [x] App shell — Sidebar (subject list, expand/collapse, NewSubjectModal), Topbar (breadcrumb, right panel toggle), StatusBar (streaming indicator, clock), RightPanel (WEAK POINTS / TASKS tabs, placeholder), DashboardPage (stats strip, empty states); React Router wired; shared UI primitives (Button, Badge, Modal, SectionLabel)

---

## Current Sprint

**Session 1 — April 16, 2026** — Foundation complete. App boots (pending `npm install`), SQLite schema in place, full app shell renders with routing.

**Known deferred items from Session 1:**
- "New Subject" button on DashboardPage is a no-op — needs shared modal state lifted to AppShell (resolve in Subject CRUD task)
- `buildBreadcrumb` in AppShell is stubbed — fills in during Subject View / Module View tasks

---

## Backlog

### Must (required for v1)
- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind, Express bootstrap, SQLite init, `.env` wiring
- [x] Database schema — run `schema.sql`, all tables: subjects, modules, ai_outputs, quizzes, quiz_modules, fa_sessions, weak_points, tasks
- [ ] Subject CRUD — `GET/POST/DELETE /subjects`; sidebar subject tree renders subjects, create/delete works
- [ ] Module upload — `POST /subjects/:id/modules/upload`; Multer config (20MB, PDF+DOCX only); file saved to `/uploads`; module row inserted
- [ ] File parsing — pdf-parse + mammoth text extraction service (`server/src/services/parser.ts`)
- [ ] Claude proxy + SSE streaming — prompt assembly service, SSE relay to client, `useStreamingOutput` hook
- [ ] Pre-Scan generation — `POST /modules/:id/generate` with `output_type: prescan`; prompt per AI constraints in PRD §9; output saved to `ai_outputs`
- [ ] Structured Notes generation — same route, `output_type: notes`; bottom-up concept ordering prompt
- [ ] Single-module Quiz generation — same route, `output_type: quiz`; configurable question count; JSON question schema
- [ ] AI output viewer — OutputPanel component: not-generated / streaming / generated states; react-markdown rendering; edit inline; regenerate with instructions
- [ ] Module View — tab bar (Pre-Scan / Notes / Quiz Generator); OutputPanel per tab
- [ ] Subject View — module list (ModuleCard), UploadZone, multi-module quiz trigger button
- [ ] Multi-module quiz — `POST /generate/multi-module-quiz`; module selection modal; quizzes + quiz_modules rows saved
- [ ] Weak Point Log — kanban board (Open / Patched / Confirmed); ErrorCard component; ErrorCardModal (create/edit/delete); CRUD routes
- [x] App shell — Sidebar, Topbar, StatusBar, right panel toggle; routing (React Router)

### Should (high priority)
- [ ] FA Session Runner — full-screen quiz runner; one question at a time; MCQ + short answer; answer evaluation; WeakPointPrompt on incorrect; session score on complete; `fa_sessions` persistence
- [ ] Reviewer export — `POST /subjects/:id/reviewer/export`; Claude generates reviewer from Confirmed weak points; DOCX + PDF download via docx + PDFKit
- [ ] Task Tracker — task list + calendar view; TaskForm; CRUD routes (`/tasks`, `/subjects/:id/tasks`)
- [ ] Dashboard — open weak point count, upcoming deadlines, recent modules

### Could (if time allows)
- [ ] Study session timer with phase labels (Pre-scan, Study, FA, etc.)
- [ ] Status bar streaming indicator (● STREAMING / ✓ SAVED)
- [ ] Toast notifications for save, export, quiz generation complete

---

## Open Blockers
(none)

---

## Agent Session Log

| Date | Agent | Task | Status |
|---|---|---|---|
| 2026-04-16 | Developer | Project scaffolding | Complete |
| 2026-04-16 | Developer | Database schema | Complete |
| 2026-04-16 | Developer | App shell | Complete |
