# Ianne's Study Hub — Product Requirements Document

**Version:** 1.2  
**Date:** April 16, 2026  
**Author:** Solo Project  
**Status:** Approved  
**Project type:** Personal Productivity Tool (v1) → Portfolio / Scalable Product (v2+)

---

## 1. Problem Statement

A CS student running a structured, phase-based academic workflow currently relies on 4 separate platforms: Google Calendar for deadlines, Google Drive for notes and weak point logs, ChatGPT for primers, and Gemini for structured notes and mock quizzes. The context-switching adds friction to every phase of the workflow, and there is no single place where a study session — from planning to AI-generated content to performance tracking — can be executed end to end. A further compounding problem is that source modules are often poorly structured and unclear, requiring significant cognitive effort just to extract usable concepts before study can begin. Current solutions are generic productivity tools or general-purpose AI chatbots; none are designed around a specific, repeatable academic workflow with this kind of source material.

---

## 2. Product Vision

A personal academic operating system where every phase of a structured study workflow — from pre-scan to post-exam analysis — can be executed in one place, powered by Claude as the AI backbone, with intelligent content generation that compensates for low-quality source material.

---

## 3. Target Users

### Primary User (v1)
**Who:** A single CS student (sole user) running a thesis-heavy term with a documented, phase-based study workflow (v2.0 of a personal system).  
**Goal:** Execute the full study workflow without switching between platforms.  
**Pain point:** Planning lives in Calendar, notes in Drive, AI outputs in ChatGPT/Gemini, and weak point tracking in a Drive spreadsheet — four contexts for one workflow. Source modules are frequently messy and hard to parse without AI assistance.

### Secondary Users
None for v1. Multi-user is explicitly deferred to v2.

---

## 4. Scope — Version 1

### In Scope

| Feature | Priority | Notes |
|---|---|---|
| Module upload (PDF, DOCX) → AI generates structured notes | Must | Core AI feature; Claude restructures messy modules into concept-ordered notes |
| Module upload → AI generates per-module mock quiz (configurable question count) | Must | MCQ + short answer; count set by user before generation |
| AI-generated 5-minute Pre-Scan summary from uploaded module | Must | Headings + key terms only; Claude extracts signal from unstructured source |
| Subject/module organizer (group uploads + outputs by subject) | Must | Replaces Drive folder structure; local storage |
| Weak Point Log — Error Card format with Status tracking (Open → Patched → Confirmed) | Must | Direct digitization of v2.0 workflow |
| AI outputs are editable; user can regenerate with inline comments/instructions | Must | User can annotate what to change and trigger a revised generation |
| Multi-module mock quiz — user selects 2+ modules, configures question count | Must | Covers summative, midterm, and final exam scenarios |
| Auto-generated Reviewer document per subject (from Confirmed weak points) | Should | Claude compiles and structures; user is notified on every update |
| FA session runner — present quiz in-app, capture answers, auto-prompt weak point logging | Should | Closes loop between quiz and weak point log |
| Task & deadline tracker with calendar view | Should | Replaces Google Calendar dependency |
| Study session timer with phase labels (Pre-scan, Study, FA, etc.) | Could | QoL; not blocking |
| Dashboard — open weak point count, upcoming deadlines, last session summary | Could | Orientation view; not blocking |

### Out of Scope (v1)
- No user authentication or accounts
- No cloud sync or remote database — local only
- No collaboration or data sharing between users
- No mobile app or PWA
- No Google Calendar / Google Drive API integration
- No spaced repetition scheduler (Anki-style)
- No flashcard deck management beyond the weak point log
- No grading or academic records tracking
- No real-time sync or offline-first architecture (local IS the persistence layer)

---

## 5. User Stories

### Module Processing
- As a student, I want to upload a PDF or DOCX module so that Claude generates structured notes with concepts ordered from foundational to advanced, even when the source material is disorganized.
- As a student, I want to upload a module and receive a 5-minute pre-scan summary (headings + key terms only) so that I can activate vocabulary before class without doing a full reading.
- As a student, I want to edit AI-generated notes or provide a comment and request a regeneration so that I can correct or refine outputs that missed something.

### Mock Quizzes
- As a student, I want to generate a mock quiz from a single module with a configurable question count so that I can run a Formative Assessment after self-study.
- As a student, I want to generate a multi-module mock quiz by selecting 2 or more modules and setting a question count so that I can prepare for summative assessments, midterms, and finals that span multiple modules.

### Weak Point Log
- As a student, I want to log a weak point as an Error Card (Topic, What I got wrong, Why I missed it, The fix, Status) so that I have an actionable remediation target.
- As a student, I want to filter my weak point log by Status (Open / Patched / Confirmed) so that I can identify exactly what to study before an exam.
- As a student, I want to update a weak point's status so that the log reflects my current readiness.

### Reviewer Document
- As a student, I want the app to auto-generate a Reviewer document per subject from all Confirmed weak points so that I have a pre-exam synthesis document without manual compilation.
- As a student, I want to be notified whenever the Reviewer is updated so that I always know its current state.

### FA Session
- As a student, I want to run a quiz inside the app so that I don't need to copy questions into a separate document.
- As a student, I want incorrect answers to prompt a pre-filled Error Card so that I capture gaps without manual overhead.

### Subject & Module Organizer
- As a student, I want to organize modules and AI outputs by subject so that I can navigate any subject's materials quickly.
- As a student, I want all AI outputs (notes, quizzes, pre-scans, reviewer) for a module visible in one place so that I don't have to search.

### Task Tracker
- As a student, I want to add tasks with deadlines and view them in a calendar so that I have one place for academic scheduling.

---

## 6. Acceptance Criteria

### Module Upload + AI Processing
- [ ] User can upload PDF and DOCX files up to 20MB
- [ ] Structured notes present concepts in bottom-up order (foundational → advanced), not the order they appear in the source
- [ ] Pre-scan summary is generated as a distinct, shorter output from structured notes
- [ ] User can edit any AI-generated output inline
- [ ] User can add a comment/instruction and trigger a regeneration; the new version replaces the previous one with no version history
- [ ] All outputs are saved under the module that generated them and persist on page reload

### Mock Quizzes
- [ ] Per-module quiz: user can set question count before generation; count is respected by the output
- [ ] Multi-module quiz: user can select 2+ modules from the same subject; question count is configurable
- [ ] Quizzes include both MCQ and short-answer question types
- [ ] Generated quizzes are saved and re-runnable as FA sessions

### Weak Point Log
- [ ] User can create an Error Card with all five fields: Topic, What I got wrong, Why, Fix, Status
- [ ] Status accepts only: Open, Patched, Confirmed
- [ ] User can filter the log by Status
- [ ] Edit and delete work without page reload

### FA Session Runner
- [ ] Questions are presented one at a time with an input or selection field
- [ ] Incorrect answers surface a pre-filled Error Card prompt (topic auto-populated from question metadata)
- [ ] Session score is displayed at end of session

### Reviewer Document
- [ ] Reviewer is auto-generated per subject from all Confirmed weak point entries
- [ ] A visible notification or indicator tells the user when the Reviewer was last updated
- [ ] Reviewer can be exported as DOCX or PDF
- [ ] No in-app rendered view required for the Reviewer

### Task Tracker
- [ ] User can create tasks with title, subject tag, and due date
- [ ] Calendar view renders tasks on their due date
- [ ] Tasks can be marked complete

---

## 7. User Flows

### Flow 1: Process a New Module
1. User navigates to a subject
2. User uploads a PDF or DOCX module
3. App displays processing state while Claude processes the file
4. App presents output options: Pre-Scan Summary, Structured Notes, Mock Quiz
5. User selects one or more outputs and (for quiz) sets question count
6. Outputs are returned, displayed inline, and saved under the module
7. User can edit inline or leave a comment and regenerate

### Flow 2: Generate a Multi-Module Quiz
1. User navigates to a subject
2. User triggers "Multi-Module Quiz"
3. User selects 2+ modules from the subject's module list
4. User sets total question count
5. App sends selected module contents to Claude with combined context
6. Quiz is generated, saved, and available as an FA session

### Flow 3: Run a Formative Assessment
1. User opens a saved quiz and starts an FA session
2. App presents questions one at a time
3. On incorrect answer: app prompts "Log as weak point?" with pre-filled Error Card
4. User reviews, edits if needed, and confirms the card (Status = Open)
5. Session ends with score summary and count of weak points logged

### Flow 4: Pre-Exam Weak Point Sweep
1. User opens Weak Point Log, filters Status = Open
2. User reviews each entry (why missed, fix)
3. User applies the fix externally, returns, updates status to Patched
4. User runs a focused FA on Patched entries (via multi-module quiz or targeted session)
5. On confirmed resolution, user sets status to Confirmed
6. Reviewer document updates automatically; user is notified

### Flow 5: Add and Track a Deadline
1. User opens Task Tracker
2. User creates a task: title, subject, due date
3. Task appears on calendar view on its due date
4. User marks task complete after submission

---

## 8. Technical Constraints

| Constraint | Decision | Reason |
|---|---|---|
| Platform | Web, desktop-first | Thesis-term usage is desktop-centric |
| Frontend | React + Vite + Tailwind | User's primary stack |
| Backend | Node.js (Express or Hono) | Handles file uploads and Claude API calls server-side |
| Database | SQLite (local) | Single-user, no auth, local-first for v1; no Supabase needed |
| Auth | None (v1) | Single user; local storage only |
| File Storage | Local filesystem (served via backend) | Uploaded files stored locally alongside DB |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) | Replaces ChatGPT + Gemini |
| Hosting | Localhost only (v1) | Personal use; no deployment needed for v1 |

---

## 9. AI Behavior Constraints

These constraints must be encoded into every Claude prompt used for content generation.

### Source Material Quality
Modules uploaded by the user are frequently disorganized, unclear, and poorly structured. Claude must not treat the source document's structure as authoritative. Instead:
- Extract all identifiable concepts regardless of where they appear in the document
- Reconstruct a logical concept order: foundational definitions first, building toward complex applications
- Make connections between concepts explicit (e.g., "this builds on X from the previous section")
- Present output in a way that gives the user both the detail level and a wide-angle view of what the module covers

### Pre-Scan Prompting
- Output must be strictly: headings and key terms only
- No explanations, no elaboration — vocabulary activation only
- Target length: readable in 3–5 minutes

### Structured Notes Prompting
- Reorder concepts from the source into a bottom-up learning sequence
- Leverage connections between concepts to give context (why does this matter, what does it connect to)
- Flag any concepts that appeared ambiguous or underdeveloped in the source material

### Reviewer Generation
- Compiled from Confirmed weak point entries only
- Structured as a recall scaffold: key concepts, formulas, pattern recognition cues — not a full re-explanation
- User is notified (in-app) every time the Reviewer is regenerated

---

## 10. Design Notes

- **Tone:** Dense and functional. Minimal chrome. High information density, no decorative elements.
- **Reference apps:** Linear (sidebar nav + content area), Notion (document-style content), Obsidian (subject/module hierarchy)
- **Layout:** Left sidebar for subject/module navigation; main content area for outputs and active tools; right panel or modal for Weak Point Log and Task Tracker
- **Wireframes:** None yet — trigger `app-designer` after PRD is confirmed
- **Branding:** Dark neutral base, single accent color, no logo required for v1

---

## 11. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | AI outputs should begin streaming within 3s of upload completion |
| File support | PDF and DOCX uploads up to 20MB |
| Persistence | All data (modules, outputs, weak points, tasks) persists in local SQLite on app restart |
| Security | Local only; no data leaves the machine except Claude API calls (module content sent to Anthropic) |
| Accessibility | Keyboard-navigable core flows; no WCAG compliance required for v1 |
| Dev timeline | v1 target: ≤ 2 weeks total development time; scope Musts first, Shoulds only if on track |

---

## 12. Open Questions

| # | Question | Owner | Status | Decision |
|---|---|---|---|---|
| 1 | When regenerating notes with comments, should the previous version be archived or replaced? | You | Closed | Replace only — no version history in v1 |
| 2 | For multi-module quizzes, should questions be distributed evenly or should Claude decide? | You | Closed | Claude decides distribution based on module content |
| 3 | Should the Reviewer document be viewable in-app or exported as a file? | You | Closed | Exportable as DOCX or PDF; no in-app rendered view required |

---

## 13. Out of Scope — Future Versions

- **[v2]** Supabase migration (auth + cloud sync + PostgreSQL)
- **[v2]** Multi-user support and shareable study sessions
- **[v2]** Mobile-responsive layout / PWA
- **[v2]** Google Calendar and Google Drive optional sync
- **[v2]** Subject-level analytics (FA score trends, weak point resolution rate, time spent)
- **[v2]** Spaced repetition scheduler for weak points (Anki-style intervals)
- **[v2]** AI-generated exam predictions based on weak point log + module content
- **[v3+]** Collaborative study rooms
- **[v3+]** Flashcard deck management

---

## Appendix

- Academic Workflow source: `Academic_Workflow_3Y3T.docx` — v2.0, Refined for Thesis-Heavy Terms
- Workflow phases this app operationalizes: Pre-Scan (I), FA Protocol (III), Weak Point Logging (IV), Iteration (V), Reviewer Maintenance (VI), Examination Protocol (VII)
- AI provider: Anthropic Claude (`claude-sonnet-4-20250514`)
- v1 is intentionally local-first and single-user to minimize infrastructure overhead during a thesis-heavy term
