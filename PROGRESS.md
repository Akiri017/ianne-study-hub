# Ianne's Study Hub — Development Progress

**Started:** April 16, 2026  
**Status:** In progress — Session 15 complete

---

## Completed Tasks

- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind + design tokens, Express bootstrap, SQLite singleton, `.env.example`, `.gitignore`
- [x] Database schema — `schema.sql` with all 9 tables, FK constraints, cascade deletes; auto-runs on server start via `db.exec()`; migration stub `001_initial_schema.ts`
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

**Session 6 — April 17, 2026** — Task Tracker + Dashboard live data complete. Task Tracker: full CRUD backend (`GET/POST /subjects/:id/tasks`, `GET/PATCH/DELETE /tasks/:id`), `TaskTracker` component in TASKS tab (add form with subject select, checkbox toggle with optimistic update, overdue styling, delete). Dashboard: `GET /api/subjects/stats` endpoint (open weak points, total modules, last 5 recent modules via JOIN), live data wired into DashboardPage (loading skeletons, stat cards, recent modules list with links). 162 tests passing. TS clean.

**Session 7 — April 17, 2026** — FA Session Runner complete. Backend: real `GET/POST/PATCH` quiz routes + `GET /subjects/:id/quizzes`; `fa_sessions` persisted on completion. Frontend: `QuizRunner` page (`/quizzes/:quizId/run`) — intro screen, progress bar, MCQ click-to-answer with correct/incorrect reveal, short-answer self-mark, final score screen with "Log Weak Point" buttons per wrong answer (pre-filled WeakPointModal). Quiz list added to SubjectView with Run buttons. 176 tests passing. TS clean.

**Session 8 — April 17, 2026** — Google AI Studio migration complete. Migrated `claude.ts` from raw Vertex AI fetch to `@google/genai` SDK (`GoogleGenAI`, `generateContentStream`, `generateContent`). Added LaTeX prohibition + Markdown heading rules to `buildPrescanSystem` and `buildNotesSystem`. Renamed `GOOGLE_API_KEY` → `GEMINI_API_KEY`. Rewrote `services-claude.test.ts` with `vi.hoisted()` + regular-function constructor mock. 173 tests passing. TS clean.

**Session 9 — April 18, 2026** — Bug fixes: sidebar toggle, notes persistence, breadcrumb names, tasks POST; inline quiz runner; AI note bridging. 178 tests passing.

**Session 10 — April 21, 2026** — Bug fixes: "No" button variant, modules API content field, persistence audit; reviewer export (DOCX+PDF); subject delete. 188 tests passing.

**Session 11 — April 21, 2026** — Fixed regeneration stale content bug by prioritizing streaming chunks over DB payload. Added unit tests for `useStreamingOutput` hook with `@testing-library/react` and `jsdom`. 188 tests passing. TS clean.

**Session 12 — April 26, 2026** — Bulk weak points from quiz results. Added `POST /api/ai/quiz-weak-points` (single Gemini call, generates `why_missed` for all wrong answers). Added `POST /api/subjects/:subjectId/weak-points/bulk` (batch insert, manual BEGIN/COMMIT/ROLLBACK for `node:sqlite` compatibility). Replaced per-question log buttons with a single "Log All to Weak Points" button in both `QuizRunner` and `InlineQuiz` (OutputPanel). Fixed quiz streaming "generation failed" false positive (post-stream SDK throw now only errors if no content was accumulated). Updated prescan Gemini prompt to primer format (Roman numerals, → arrows, contrast pairs, BIG PICTURE FLOW, KEY TAKEAWAYS). QA ran for first time this session — fixed stale transaction mock and added ROLLBACK path test. 208 tests passing. TS clean.

**Session 13 — April 28, 2026** — Inline Reviewer Tab. Replaced file export with inline markdown display. Added `GET /api/subjects/:subjectId/reviewer` and `ReviewerPanel` component. Tests updated. 214 tests passing. TS clean.

**Session 15 — April 29, 2026** — Multi-module quiz button UX. Button in SubjectView was conditionally hidden when `modules.length < 2`; now always visible and disabled with a tooltip when fewer than 2 modules are uploaded. 214 tests passing. TS clean.

**Session 14 — April 28, 2026** — Reviewer persistence bug fix. `GET /reviewer` was re-generating on every load with no DB write, losing content on navigation. Split into: `GET /` (reads `subject_reviewers` table, no AI call) and `POST /generate` (Gemini + upsert). Added `subject_reviewers` table (UNIQUE on subject_id, CASCADE on subject delete). Frontend updated: `useEffect` on mount loads persisted content; `generateReviewer` replaces `getReviewer` on button actions. `db-schema.test.ts` updated to expect 9 tables. 216 tests passing. TS clean.

**Known deferred items:**
- Breadcrumb subject/module names show IDs only — name resolution needs a context or state lift (follow-up)
- StatusBar streaming indicator not wired to OutputPanel — needs a context or prop lift (follow-up)
- Single-module quiz raw JSON in OutputPanel — full runner integration deferred

---

## Backlog

### Must (required for v1)
- [x] Project scaffolding — monorepo setup (client + server + shared), Vite config, Tailwind, Express bootstrap, SQLite init, `.env` wiring
- [x] Database schema — run `schema.sql`, all tables: subjects, modules, ai_outputs, quizzes, quiz_modules, fa_sessions, weak_points, tasks, subject_reviewers
- [x] Subject CRUD — `GET/POST/DELETE /subjects`; sidebar subject tree renders subjects, create/delete works
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
- [x] FA Session Runner — full-screen quiz runner; one question at a time; MCQ + short answer; answer evaluation; WeakPointPrompt on incorrect; session score on complete; `fa_sessions` persistence
- [x] Reviewer export — `POST /subjects/:id/reviewer/export`; Claude generates reviewer from Confirmed weak points; DOCX + PDF download via docx + PDFKit
- [x] Task Tracker — task list + calendar view; TaskForm; CRUD routes (`/tasks`, `/subjects/:id/tasks`)
- [x] Dashboard — open weak point count, upcoming deadlines, recent modules

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
| 2026-04-17 | Developer | Task Tracker CRUD + TaskTracker UI | Complete |
| 2026-04-17 | Developer | Dashboard live data + /stats endpoint | Complete |
| 2026-04-17 | QA | Session 6 verification | Complete — 162 tests passing, TS clean |
| 2026-04-17 | Developer | FA Session Runner — backend routes + QuizRunner UI | Complete |
| 2026-04-17 | QA | Session 7 verification | Complete — 176 tests passing, TS clean |
| 2026-04-17 | Developer | Google AI Studio migration + prompt refinements | Complete |
| 2026-04-17 | QA | Session 8 verification | Complete — 173 tests passing, TS clean |
| 2026-04-18 | QA | Session 9 verification | Complete — 178 tests passing |
| 2026-04-21 | QA | Session 10 verification | Complete — 188 tests passing |
| 2026-04-21 | CI/CD | Session 11 commit | Complete — 07fa1d4 |
| 2026-04-26 | Developer | Bulk weak points (ai-weak-points route, bulk insert route) | Complete |
| 2026-04-26 | Developer | Prescan primer prompt + quiz streaming fix + InlineQuiz bulk UI | Complete |
| 2026-04-26 | QA | Session 12 verification — fix stale transaction mock, add ROLLBACK test | Complete — 208 tests passing, TS clean |
| 2026-04-26 | CI/CD | Session 12 commit | Complete — ecea9dd |
| 2026-04-28 | Developer | Inline Reviewer Tab | Complete |
| 2026-04-28 | QA | Session 13 verification | Complete — 214 tests passing, TS clean |
| 2026-04-28 | CI/CD | Session 13 commit | Complete — 6159433 |
| 2026-04-28 | Developer | Reviewer persistence bug fix — subject_reviewers table, GET/POST split, frontend useEffect | Complete |
| 2026-04-28 | QA | Session 14 verification — caught missing db-schema.test.ts update, PM patched | Complete — 216 tests passing, TS clean |
| 2026-04-29 | PM | Multi-module quiz button visibility fix — SubjectView always shows button, disabled when < 2 modules | Complete |
| 2026-04-29 | QA | Session 15 verification | Complete — 214 tests passing, TS clean |
| 2026-04-29 | CI/CD | Session 15 commit | Complete — 5ed4b1c |
