# Ianne's Study Hub — Development Progress

**Started:** April 16, 2026  
**Status:** In progress — Session 5 complete

---

## Completed Tasks

- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind + design tokens, Express bootstrap, SQLite singleton, `.env.example`, `.gitignore`
- [x] Database schema — `schema.sql` with all 8 tables, FK constraints, cascade deletes; auto-runs on server start via `db.exec()`; migration stub `001_initial_schema.ts`
- [x] App shell — Sidebar (subject list, expand/collapse, NewSubjectModal), Topbar (breadcrumb, right panel toggle), StatusBar (streaming indicator, clock), RightPanel (WEAK POINTS / TASKS tabs, placeholder), DashboardPage (stats strip, empty states); React Router wired; shared UI primitives (Button, Badge, Modal, SectionLabel)
- [x] Claude proxy + SSE streaming — `streamGeneration()` with SSE relay, 30s AbortController timeout, prompt caching on system block; prompt builders for prescan/notes/quiz per PRD §9; `POST /modules/:id/generate`, `POST /outputs/:id/regenerate` (SSE); `GET /outputs/:id`, `PATCH /outputs/:id`; `useStreamingOutput` hook (idle/streaming/done/error); typed API wrappers in `client/src/lib/api.ts`
- [x] AI Output Viewer — `OutputPanel` component (not-generated/streaming/generated states, react-markdown, quiz raw JSON, inline editor, RegenerateModal); `ModuleView` (Pre-Scan/Notes/Quiz tab bar, dot indicators, key remount); `SubjectView` (header, UploadZone click-to-upload, ModuleCard list); `ModuleCard` output chips; Sidebar NavLink fix + real module list; routes registered in `App.tsx`

---

## Current Sprint

**Session 1 — April 16, 2026** — Foundation complete. App boots, SQLite schema in place, full app shell renders with routing.

**Session 2 — April 16, 2026** — Subject CRUD + Module upload + File parsing complete. Live sidebar, NewSubjectModal, multer 2.x upload, pdf-parse + mammoth extraction. Switched to `node:sqlite` (Node 24 built-in) after better-sqlite3 failed to compile.

**Session 3 — April 17, 2026** — Claude proxy + SSE streaming complete. `streamGeneration()` with SSE relay, prompt caching, 30s timeout, all three prompt types. Routes: POST /generate, POST /regenerate, GET+PATCH /outputs. Client `useStreamingOutput` hook. 100 tests passing.

**Session 4 — April 17, 2026** — AI Output Viewer + Subject/Module views complete. OutputPanel (three states, react-markdown, inline edit, RegenerateModal), ModuleView (tab bar with dot indicators), SubjectView (UploadZone, ModuleCard list), Sidebar NavLink fix + real module list. App is end-to-end usable: create subject → upload file → generate prescan/notes/quiz → view/edit/regenerate. `streamGeneration()` with SSE relay, prompt caching, 30s timeout, all three prompt types. Routes: POST /generate, POST /regenerate, GET+PATCH /outputs. Client `useStreamingOutput` hook. 100 tests passing.

**Session 5 — April 17, 2026** — Weak Point Log + Multi-module Quiz complete. Weak Point Log: full CRUD backend (`GET/POST /subjects/:id/weak-points`, `PATCH/DELETE /weak-points/:id`), kanban RightPanel UI (Open/Patched/Confirmed sections, ErrorCard, ErrorCardModal with create/edit/delete). Multi-module quiz: `generateText()` non-streaming Gemini call, `POST /generate/multi-module-quiz` (validates module_ids ≥2, combines module text, auto-generates title), `MultiModuleQuizModal` in SubjectView, `createMultiModuleQuiz` API wrapper. 139 tests passing. TS clean.

**Known deferred items:**
- Breadcrumb subject/module names show IDs only — name resolution needs a context or state lift (follow-up)
- StatusBar streaming indicator not wired to OutputPanel — needs a context or prop lift (follow-up)
- Full quiz UI (question cards, MCQ/short-answer, FA session) — separate session
- Client-side `useStreamingOutput` hook has no unit tests — needs `@testing-library/react` + `jsdom` (not yet installed)

---

## Backlog

### Must (required for v1)
- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind, Express bootstrap, SQLite init, `.env` wiring
- [x] Database schema — run `schema.sql`, all tables: subjects, modules, ai_outputs, quizzes, quiz_modules, fa_sessions, weak_points, tasks
- [ ] Subject CRUD — `GET/POST/DELETE /subjects`; sidebar subject tree renders subjects, create/delete works
- [x] Module upload — `POST /subjects/:id/modules/upload`; Multer config (20MB, PDF+DOCX only); file saved to `/uploads`; module row inserted
- [x] File parsing — pdf-parse + mammoth text extraction service (`server/src/services/parser.ts`)
- [x] Claude proxy + SSE streaming — prompt assembly service, SSE relay to client, `useStreamingOutput` hook
- [x] Pre-Scan generation — `POST /modules/:id/generate` with `output_type: prescan`; prompt per AI constraints in PRD §9; output saved to `ai_outputs`
- [x] Structured Notes generation — same route, `output_type: notes`; bottom-up concept ordering prompt
- [x] Single-module Quiz generation — same route, `output_type: quiz`; configurable question count; JSON question schema (rendered as raw JSON for now — full quiz UI is a follow-up session)
- [x] AI output viewer — OutputPanel component: not-generated / streaming / generated states; react-markdown rendering; edit inline; regenerate with instructions
- [x] Module View — tab bar (Pre-Scan / Notes / Quiz Generator); OutputPanel per tab
- [x] Subject View — module list (ModuleCard), UploadZone, multi-module quiz trigger button
- [x] Multi-module quiz — `POST /generate/multi-module-quiz`; module selection modal; quizzes + quiz_modules rows saved
- [x] Weak Point Log — kanban board (Open / Patched / Confirmed); ErrorCard component; ErrorCardModal (create/edit/delete); CRUD routes
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
| 2026-04-16 | Developer | Module upload | Complete |
| 2026-04-16 | Developer | File parsing | Complete |
| 2026-04-17 | Developer | Claude proxy + SSE streaming | Complete |
| 2026-04-17 | QA | Session 3 verification | Complete — 100 tests passing |
| 2026-04-17 | CI/CD | Session 3 commit | Complete — 69f2f56 |
| 2026-04-17 | Developer | OutputPanel + Module View + Subject View | Complete |
| 2026-04-17 | QA | Session 4 verification | Complete — 100 tests passing, TS clean |
| 2026-04-17 | CI/CD | Session 4 commit | Complete — 58b5e9d |
| 2026-04-17 | Developer A | Weak Point Log backend + kanban UI | Complete |
| 2026-04-17 | Developer B | Multi-module quiz + generateText() | Complete |
| 2026-04-17 | QA | Session 5 verification | Complete — 139 tests passing, TS clean |
