# Ianne's Study Hub — Design Specification

**Version:** 1.0  
**Date:** April 16, 2026  
**Based on:** PRD v1.2, ARCHITECTURE v1.0  
**Mode:** Stitch-informed — aesthetic direction adapted from reference screens; components grounded in PRD/ARCHITECTURE only  

---

## 1. Design System

### 1.1 Aesthetic Direction

**Tone:** Dense and functional. High information density, zero decoration. Feels like a precision tool, not a productivity app. Every pixel earns its place.  
**References:** Linear (sidebar + content area), the Stitch screens (dark navy, kanban, tab-nav), Obsidian (hierarchy).  
**One thing to remember:** The status bar at the bottom and the ALL CAPS section labels — gives it a terminal/IDE feel that matches the CS student persona.

---

### 1.2 Color Palette

```css
:root {
  /* Backgrounds */
  --bg-base:        #0B0F19;   /* Page background — deepest layer */
  --bg-surface:     #111827;   /* Cards, panels, sidebar */
  --bg-elevated:    #1C2333;   /* Modals, dropdowns, hover states */
  --bg-subtle:      #1F2937;   /* Input backgrounds, code blocks */

  /* Borders */
  --border-default: #2D3748;   /* Card borders, dividers */
  --border-strong:  #4A5568;   /* Focus rings, active outlines */

  /* Text */
  --text-primary:   #F1F5F9;   /* Body text, headings */
  --text-secondary: #94A3B8;   /* Labels, metadata, timestamps */
  --text-muted:     #64748B;   /* Disabled states, placeholders */
  --text-inverse:   #0B0F19;   /* Text on accent backgrounds */

  /* Accent — single indigo */
  --accent:         #6366F1;   /* Primary CTA, active nav, links */
  --accent-hover:   #818CF8;   /* Hover state for accent elements */
  --accent-subtle:  #1E1B4B;   /* Accent background (badges, highlights) */

  /* Status colors */
  --status-open:    #EF4444;   /* Red — Open weak points */
  --status-open-bg: #450A0A;
  --status-patched: #F59E0B;   /* Amber — Patched */
  --status-patched-bg: #451A03;
  --status-confirmed: #10B981; /* Green — Confirmed */
  --status-confirmed-bg: #064E3B;

  /* Semantic */
  --success:        #10B981;
  --warning:        #F59E0B;
  --error:          #EF4444;
  --info:           #6366F1;

  /* Streaming indicator */
  --stream-pulse:   #6366F1;
}
```

---

### 1.3 Typography

```css
/* Import in index.html */
/* Google Fonts: IBM Plex Mono (labels, metadata) + Inter (body) */
/* OR: local stack fallback */

--font-sans:  'Inter', 'SF Pro Text', system-ui, sans-serif;
--font-mono:  'IBM Plex Mono', 'JetBrains Mono', monospace;

/* Scale */
--text-xs:    0.75rem;   /* 12px — status bar, timestamps */
--text-sm:    0.875rem;  /* 14px — labels, secondary text */
--text-base:  1rem;      /* 16px — body */
--text-lg:    1.125rem;  /* 18px — card titles */
--text-xl:    1.25rem;   /* 20px — section headers */
--text-2xl:   1.5rem;    /* 24px — page titles */

/* Weights */
--font-normal:  400;
--font-medium:  500;
--font-semibold: 600;
--font-bold:    700;

/* Section labels use: font-mono, text-xs, font-semibold, tracking-widest, text-secondary, UPPERCASE */
```

---

### 1.4 Spacing Scale

Based on 4px base unit. Use Tailwind's default scale:

```
4px  → gap-1   (icon padding, tight inline spacing)
8px  → gap-2   (between badge elements)
12px → gap-3   (card internal padding tight)
16px → gap-4   (standard card padding)
20px → gap-5
24px → gap-6   (between sections)
32px → gap-8   (page section spacing)
```

---

### 1.5 Border Radius

```css
--radius-sm:  4px;   /* Badges, status chips */
--radius-md:  6px;   /* Cards, inputs, buttons */
--radius-lg:  8px;   /* Modals, panels */
--radius-xl:  12px;  /* Nothing rounded, no large bubbles */
```

---

### 1.6 Elevation / Shadow

```css
--shadow-card:   0 1px 3px rgba(0,0,0,0.4);
--shadow-modal:  0 8px 32px rgba(0,0,0,0.6);
--shadow-dropdown: 0 4px 16px rgba(0,0,0,0.5);
```

---

### 1.7 Motion

Keep animations purposeful and fast — this is a tool, not a landing page.

```css
--duration-fast:   100ms;   /* Hover state transitions */
--duration-normal: 200ms;   /* Panel open/close, tab switch */
--duration-slow:   300ms;   /* Modal entrance */
--ease-default:    ease;
--ease-out:        cubic-bezier(0.0, 0.0, 0.2, 1);
```

Streaming text: no special animation — just natural text append via SSE. Show a pulsing cursor `▋` at the end of the current line during streaming.

---

## 2. Layout

### 2.1 App Shell

```
┌─────────────────────────────────────────────────────────────────┐
│  SIDEBAR (240px fixed)  │  CONTENT AREA (flex-1)  │  RIGHT PANEL (280px, toggleable) │
│                         │                          │                                  │
│  Subject/module tree    │  Page content varies     │  Weak Point Log                 │
│  Nav items              │  per active route        │  Task Tracker                   │
│                         │                          │  (toggled by toolbar icon)       │
└─────────────────────────────────────────────────────────────────┘
│  STATUS BAR (24px, full width, bg-surface, border-t border-default) │
└─────────────────────────────────────────────────────────────────┘
```

- **Sidebar:** `bg-surface`, `border-r border-default`, no collapse in v1
- **Content area:** `bg-base`, scrollable independently
- **Right panel:** `bg-surface`, `border-l border-default`, fixed width, toggled via icon in topbar
- **Status bar:** always visible at bottom — shows current subject/module context, last save indicator, streaming state

### 2.2 Topbar

Height: `48px`. `bg-surface`, `border-b border-default`.

Left: App name `STUDY HUB` in `font-mono text-sm font-semibold text-secondary tracking-widest`  
Center: Breadcrumb — `Subject > Module` (text-secondary, separator `›`)  
Right: Right panel toggle icon button

---

## 3. Screen Inventory

| Screen | Route | Purpose |
|---|---|---|
| Dashboard | `/` | Overview: open weak points count, upcoming deadlines, last session summary |
| Subject View | `/subjects/:id` | Module list for a subject; upload zone; multi-module quiz trigger |
| Module View | `/subjects/:subjectId/modules/:moduleId` | AI outputs (Pre-Scan, Notes, Quiz) via tabs |
| FA Session | `/sessions/:sessionId` | Full-screen quiz runner, one question at a time |
| Weak Point Log | Right panel or `/weak-points` | Kanban board: Open / Patched / Confirmed columns |
| Task Tracker | Right panel tab | Task list + calendar view |
| Multi-Module Quiz Builder | Modal | Select modules, set count, generate |

---

## 4. Component Specification

---

### 4.1 Sidebar

**Component:** `Sidebar`  
**Width:** 240px fixed  
**Background:** `bg-surface`

**Sections:**
1. App header — `STUDY HUB` wordmark + version tag
2. Navigation items — `Dashboard`, (separator), subject list
3. Bottom — nothing in v1 (no settings link needed)

**Subject tree item:**
- Collapsed: subject name + chevron + module count badge
- Expanded: subject name + list of module items indented 12px
- Active subject: left border accent `border-l-2 border-accent`, text-primary
- Hover: `bg-elevated`

**Module tree item:**
- Module title (truncate at 1 line)
- File type badge: `PDF` or `DOCX` — `font-mono text-xs bg-subtle text-muted`
- Active: `bg-accent-subtle text-accent`

**"New Subject" button:** Bottom of subject list, `text-secondary text-sm` + `+` icon, triggers `NewSubjectModal`

**States:**
- Default, hover (`bg-elevated`), active (accent border), loading (skeleton shimmer on initial load)

---

### 4.2 Topbar

**Component:** `Topbar`  
**Height:** 48px

**Props:** `breadcrumb: { subject?: string, module?: string, page?: string }`

Breadcrumb renders: `Subject › Module` or just `Subject` or page name. Truncates long names.

Right side: `RightPanelToggle` icon button — toggles right panel open/closed. Shows active dot when panel has content (always in v1).

---

### 4.3 Status Bar

**Component:** `StatusBar`  
**Height:** 24px  
**Font:** `font-mono text-xs text-muted`

Left section: Active subject + module path  
Center: `●  STREAMING` (accent color pulse) when generation is in progress; `✓  SAVED` when auto-save fires; empty otherwise  
Right section: Current time (HH:MM)

---

### 4.4 Dashboard Page

**Component:** `DashboardPage`  
**Route:** `/`

**Layout:** 2-column grid below a stats strip

**Stats strip (3 cards, horizontal):**
- Open Weak Points — large number, red if > 0, green if 0; label below
- Upcoming Deadlines — count; "Next: {due_date}" below
- (No study streak — not in PRD)

Each stat card: `bg-surface border border-default rounded-md p-4`

**Recent Modules section:**
- Section label: `RECENT MODULES` in ALL CAPS mono style
- List of last 3–5 accessed modules (from `modules` ordered by `created_at DESC`)
- Each row: module title + subject name + file type badge + last output type generated

**Empty state:** If no subjects exist yet — centered message: "No subjects yet. Create your first subject to get started." + `New Subject` button.

---

### 4.5 Subject View

**Component:** `SubjectView`  
**Route:** `/subjects/:id`

**Header:** Subject name (text-2xl, text-primary) + module count (text-secondary text-sm)

**Upload Zone:**
- `UploadZone` component — dashed border, `border-dashed border-border-strong`, rounded-md, `p-8` centered
- Drag-and-drop or click to browse
- Label: `DROP PDF OR DOCX HERE` (mono, muted)
- Subtext: `Max 20MB · PDF and DOCX only`
- States: default, drag-over (accent border + accent-subtle bg), uploading (spinner + filename + progress), error (red border + error message)
- Requires `title` input field before upload is accepted — inline input appears after file is selected

**Module List:**
- Section label: `MODULES` 
- Each module: `ModuleCard` component (see 4.6)
- Sort: newest first

**Multi-Module Quiz button:**
- `GENERATE MULTI-MODULE QUIZ` — secondary button, visible when ≥ 2 modules exist
- Opens `MultiModuleQuizModal`

**Empty state:** "No modules yet. Upload a PDF or DOCX to get started."

---

### 4.6 ModuleCard

**Component:** `ModuleCard`  
**Usage:** Inside Subject View module list

**Layout:** Horizontal card, `bg-surface border border-default rounded-md p-4`

Left: Module title (text-lg, text-primary) + file type badge + created date (text-secondary text-xs)  
Right: Output type chips — `PRE-SCAN`, `NOTES`, `QUIZ` — each chip shows: generated (accent bg) or not generated (subtle, muted text)

Click → navigates to Module View.

**States:** default, hover (`border-border-strong`), loading (skeleton)

---

### 4.7 Module View

**Component:** `ModuleView`  
**Route:** `/subjects/:subjectId/modules/:moduleId`

**Header:** Module title + file type badge + subject breadcrumb

**Tab bar:** `Pre-Scan` | `Structured Notes` | `Quiz Generator`  
- Active tab: bottom border `border-b-2 border-accent`, text-primary  
- Inactive: text-secondary, hover text-primary

Each tab contains a `OutputPanel` component.

---

### 4.8 OutputPanel

**Component:** `OutputPanel`  
**Props:** `outputType: 'prescan' | 'notes' | 'quiz'`, `moduleId`, `existingOutput?`

**States — Not Yet Generated:**
- Center-aligned empty state
- Description of what this output is (1 line)
- For `quiz`: `QuestionCountInput` (number input, min 1, max 50, default 10)
- `GENERATE` button (accent, full-width or prominent)

**States — Generating (SSE streaming):**
- Content area shows streamed markdown as it arrives
- `StatusBar` shows `● STREAMING`
- Pulsing cursor at end of last line
- `GENERATING…` label replaces button; non-interactive

**States — Generated:**
- `OutputContent` — renders markdown via `react-markdown`
- Top toolbar (compact, right-aligned):
  - `EDIT` toggle — switches to `OutputEditor` (textarea with markdown)
  - `REGENERATE` — opens `RegenerateModal` (instruction input)
  - For quiz type: `START FA SESSION` button (accent)
- Auto-save on blur when in edit mode

**OutputEditor:**
- Full-width `textarea`, monospace font, `bg-subtle border-border-default`
- `SAVE` fires `PATCH /outputs/:id`; `CANCEL` reverts

**RegenerateModal:**
- Title: `REGENERATE WITH INSTRUCTIONS`
- Textarea: "What should Claude change?" placeholder
- `REGENERATE` (accent) + `CANCEL`
- Previous content is replaced on stream completion; no version history

---

### 4.9 QuizGenerator (tab inside Module View)

Same as `OutputPanel` with `outputType='quiz'` but with additional config:

- `QuestionCountInput`: labeled `QUESTION COUNT`, number stepper, 1–50
- After generation: shows question count summary + `START FA SESSION` button
- Questions NOT rendered inline in this view — they only appear in FA Session runner

---

### 4.10 MultiModuleQuizModal

**Component:** `MultiModuleQuizModal`  
**Trigger:** "Generate Multi-Module Quiz" in Subject View

**Layout:** Modal, max-width 540px

Fields:
1. `QUIZ TITLE` — text input (optional, auto-generates if empty)
2. `SELECT MODULES` — checklist of all modules in the subject; minimum 2 required; each item shows module title + file type badge
3. `QUESTION COUNT` — number input, 1–100
4. `GENERATE` (accent, disabled until ≥ 2 modules selected + count set)

**States:** idle, generating (spinner, "Claude is building your quiz…"), done (modal closes, quiz saved, navigates to quiz or shows success toast)

---

### 4.11 FA Session Runner

**Component:** `FASessionRunner`  
**Route:** `/sessions/:sessionId`  
**Full-screen:** hides sidebar and right panel; minimal chrome

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [QUIZ TITLE]      Q 3/10    ████████░░  [End Session] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [question text]                                    │
│                                                     │
│  MCQ: 4 option buttons (A B C D)                   │
│  OR Short Answer: textarea                          │
│                                                     │
│            [SUBMIT ANSWER]                         │
└─────────────────────────────────────────────────────┘
```

**Question card:** `bg-surface border border-default rounded-lg p-8`, centered, max-width 720px, auto-margins

**MCQ options:** `OptionButton` — full-width, `bg-subtle border border-default rounded-md`, left-aligned label (`A.`, `B.`, etc.) + text. Hover: `bg-elevated`. Selected: `border-accent bg-accent-subtle`.

**Short answer:** Textarea, `bg-subtle`, resize-y, min-height 100px

**After submit — correct:** Card border flashes `--success` for 300ms → advances to next question  
**After submit — incorrect:** Card border flashes `--error` → `WeakPointPrompt` appears (see 4.12)  

**Progress bar:** `bg-accent` filled portion, `bg-subtle` track, full width below topbar

**Session complete screen:**
- Score: `8 / 10 CORRECT` in large mono font
- `X weak points logged this session`
- `BACK TO SUBJECT` button

---

### 4.12 WeakPointPrompt

**Component:** `WeakPointPrompt`  
**Context:** Appears inline below question after incorrect answer in FA session

**Title:** `LOG WEAK POINT?` (mono, muted)

**Pre-filled fields:**
- `TOPIC` — pre-filled from question's `topic` metadata (editable)
- `WHAT I GOT WRONG` — empty, user fills (1-sentence target)
- `WHY I MISSED IT` — empty, user fills
- `THE FIX` — empty, user fills
- `STATUS` — locked to `Open` at creation

**Buttons:** `LOG AND CONTINUE` (accent) | `SKIP` (text button, muted)  
`LOG AND CONTINUE` fires `POST /subjects/:id/weak-points`, then advances to next question.

---

### 4.13 Weak Point Log (Right Panel)

**Component:** `WeakPointLog`  
**Location:** Right panel (always visible when panel is open)

**Layout:** Kanban board, 3 columns: `OPEN` | `PATCHED` | `CONFIRMED`  
Each column header: status label + count badge + `+` add button

**Column scroll:** Each column scrolls independently, `overflow-y-auto`

**ErrorCard (kanban card):**
```
┌─────────────────────────────────┐
│  [OPEN]        WP-{id}          │
│  Topic title                    │
│  ✗ What went wrong (1 line)     │
│  ✓ Fix (1 line)                 │
│  ────────────────────────────── │
│  Subject name                   │
└─────────────────────────────────┘
```

- Status badge: colored per status (red/amber/green, small font-mono)
- WP-ID: `font-mono text-xs text-muted`
- Topic: `text-sm font-semibold text-primary`
- What went wrong: `✗` icon + text-sm text-secondary
- Fix: `✓` icon + text-sm text-secondary
- Subject name: `font-mono text-xs text-muted`

**Hover state:** `border-border-strong`, shows `EDIT` icon (pencil) top-right

**Click on card → `ErrorCardModal`** (full edit view)

**Filter:** Dropdown above columns — filter by subject (all subjects or specific one)

**Add button (`+`):** Opens `ErrorCardModal` in create mode with status pre-set to that column's status

---

### 4.14 ErrorCardModal

**Component:** `ErrorCardModal`  
**Trigger:** Click `+` in column header or click existing card

**Mode:** `create` | `edit`

**Fields:**
- `TOPIC` — text input
- `WHAT I GOT WRONG` — textarea (target: 1 sentence)
- `WHY I MISSED IT` — textarea
- `THE FIX` — textarea
- `STATUS` — segmented control: `Open` | `Patched` | `Confirmed`
- `SUBJECT` — select dropdown (shows all subjects)

**Buttons (create):** `CREATE CARD` (accent) + `CANCEL`  
**Buttons (edit):** `SAVE CHANGES` (accent) + `DELETE` (text, error color) + `CANCEL`

**Validation:** All fields required except subject defaults to current subject context.

---

### 4.15 Task Tracker (Right Panel Tab)

**Component:** `TaskTracker`  
**Location:** Second tab in right panel (tab labels: `WEAK POINTS` | `TASKS`)

**Tab switch:** Clicking changes right panel content between `WeakPointLog` and `TaskTracker`

**Sections:**

**Task List:**
- Section label: `TASKS`
- Each task: checkbox + title + subject tag + due date chip
- Due date chip: red if overdue, amber if due today, muted otherwise
- Completed task: strikethrough text-muted

**Calendar View:**
- Minimal month calendar — grid of days
- Days with tasks: small accent dot below date number
- Clicking a day with tasks shows tasks inline below calendar
- Navigation: `‹` `›` month prev/next

**Add Task:** `+ ADD TASK` inline button opens `TaskForm` inline (not a modal)

**TaskForm:**
- `TITLE` — text input
- `DUE DATE` — date input
- `SUBJECT` — select (optional)
- `ADD` + `CANCEL` (inline, compact)

---

### 4.16 Shared Primitives

#### Button

Variants:
- `primary` — `bg-accent text-inverse hover:bg-accent-hover`, rounded-md
- `secondary` — `bg-surface border border-default text-primary hover:bg-elevated`
- `ghost` — no background, text-secondary, hover text-primary
- `danger` — `bg-error/10 border border-error text-error hover:bg-error/20`

Sizes: `sm` (h-7 px-3 text-sm), `md` (h-9 px-4 text-sm), `lg` (h-10 px-5 text-base)

States: default, hover, active (scale 0.98), disabled (opacity-40, cursor-not-allowed), loading (spinner replaces text)

#### Badge / Chip

Usage: file types, status indicators, output type presence

Variants:
- `default` — `bg-subtle text-muted border border-default`
- `accent` — `bg-accent-subtle text-accent border border-accent/30`
- `open` — `bg-[--status-open-bg] text-[--status-open]`
- `patched` — `bg-[--status-patched-bg] text-[--status-patched]`
- `confirmed` — `bg-[--status-confirmed-bg] text-[--status-confirmed]`

All: `font-mono text-xs font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wide`

#### SectionLabel

Used throughout for section headers:  
`font-mono text-xs font-semibold text-secondary tracking-widest uppercase`  
Often with a bottom border separator.

#### Modal / Overlay

- Backdrop: `bg-black/60 backdrop-blur-[2px]`
- Panel: `bg-surface border border-default rounded-lg shadow-modal`
- Max widths: 480px (small), 540px (medium), 640px (large)
- Enter animation: fade-in + scale from 0.97 to 1.0, 200ms ease-out
- Keyboard: `Escape` closes, focus trap inside

#### Toast / Notification

- Bottom-right, stacked
- Auto-dismiss: 3s
- Variants: `success` (green left border), `error` (red left border), `info` (accent left border)
- Content: short message only, no actions in v1

---

## 5. UX Flow Descriptions

### Flow 1: Process a New Module

1. User clicks a subject in the sidebar → `SubjectView` loads
2. User drags a file onto `UploadZone` → file appears with size info + title input
3. User types module title → clicks `UPLOAD`
4. `POST /subjects/:id/modules/upload` fires → `ModuleCard` appears in list (loading state briefly)
5. User clicks the new module → `ModuleView` opens, all 3 tabs show "not generated" state
6. User clicks `Pre-Scan` tab → clicks `GENERATE` → `StatusBar` shows `● STREAMING`
7. Content streams in real-time → pulsing cursor at end of text
8. Stream ends → content fully rendered, editable, `SAVED` flashes in status bar
9. User can click `EDIT`, modify inline, blur → auto-save fires

### Flow 2: Run a Formative Assessment

1. User is in `Module View` → `Quiz Generator` tab → output already generated
2. User clicks `START FA SESSION` → navigates to `/sessions/:sessionId`
3. Sidebar and right panel hidden; full-screen quiz UI
4. First question renders; user selects MCQ option or types short answer
5. `SUBMIT ANSWER` → answer evaluated
   - **Correct:** border flash green → next question
   - **Incorrect:** border flash red → `WeakPointPrompt` slides in below
6. User fills weak point or skips → question advances
7. Final question answered → `Session Complete` screen with score + weak point count
8. `BACK TO SUBJECT` returns to subject view

### Flow 3: Weak Point Lifecycle

1. Card created with `Status: Open` (manually or via FA session)
2. Visible in `OPEN` column of kanban; user studies the fix
3. User drags card to `PATCHED` or clicks card → `ErrorCardModal` → changes status → `SAVE`
4. Card moves to `PATCHED` column
5. User runs FA on patched concepts → passes → opens card → sets `Confirmed`
6. Card moves to `CONFIRMED` column
7. Reviewer export now includes this entry

### Flow 4: Export Reviewer Document

1. User opens `Subject View`
2. Right panel is open on `Weak Points` tab → user sees `Confirmed` count
3. User clicks `EXPORT REVIEWER` (button in Subject View header, only active if Confirmed count > 0)
4. `ExportModal` opens: choose `DOCX` or `PDF` → `EXPORT`
5. `POST /subjects/:id/reviewer/export` → file download triggers
6. Toast: `Reviewer exported — 12 confirmed entries`

### Flow 5: Multi-Module Quiz

1. User in `Subject View` → clicks `GENERATE MULTI-MODULE QUIZ`
2. `MultiModuleQuizModal` opens
3. User checks 2+ modules, sets question count, optionally sets title
4. `GENERATE` → modal shows loading state, "Claude is building your quiz…"
5. Stream completes → modal closes → quiz saved → toast: "Quiz generated — 20 questions"
6. Quiz appears in a `QUIZZES` section in Subject View (separate from module list)
7. User can start an FA session from there

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Kanban layout for Weak Points | Matches the status lifecycle (Open → Patched → Confirmed) visually. Filtering by column is implicit — the layout IS the filter. |
| Tab nav for module outputs (Pre-Scan / Notes / Quiz) | Three outputs per module map naturally to tabs. Avoids a nested list. Matches the Stitch inspiration. |
| Right panel for Weak Points + Tasks | Both are persistent reference panels — not page-level content. Toggling keeps them accessible from any screen without navigation. |
| FA Session hides sidebar/right panel | Minimizes distraction during active assessment. Same pattern as Linear's focused issue view. |
| Status bar instead of toasts for streaming | Persistent status during generation is less intrusive than a toast; streaming can take 10–30 seconds. Toast is reserved for one-off actions (save, export). |
| ALL CAPS mono section labels | Borrows from IDE/terminal aesthetics. Signals "tool" rather than "app". Cheap visual hierarchy without font size inflation. |
| `STUDY HUB` wordmark, no logo | Per PRD — no logo required for v1. Wordmark in mono maintains the aesthetic. |
| ErrorCard shows only Topic + What + Fix in kanban | Those 3 fields are the scan-relevant ones. Full detail only on click. Keeps kanban dense. |
| No quiz question preview in Module View | Questions are only meaningful in a test context. Previewing them outside FA would defeat the assessment purpose. |

---

## 7. Open Design Questions

All resolved before dev handoff.

| # | Question | Decision |
|---|---|---|
| 1 | Where does the Reviewer export button live? | Subject View header, only active if Confirmed count > 0 |
| 2 | Does the right panel persist across navigation? | Yes — state persists; closing it is explicit (toggle button) |
| 3 | Where are quizzes (multi-module) listed? | Separate `QUIZZES` section in Subject View, below module list |
| 4 | Is there a quiz list view? | No separate page — they're listed per-subject in Subject View |
| 5 | How are FA sessions initiated for multi-module quizzes? | Same `START FA SESSION` button on the quiz card in Subject View |
| 6 | Dashboard — what constitutes "recent"? | Last 5 modules ordered by `created_at DESC` across all subjects |

---

## Appendix

- PRD: `PRD.md` v1.2
- Architecture: `ARCHITECTURE.md` v1.0
- Design inspiration: Google Stitch screens (dark nav/content/panel layout, kanban weak points, tab-based module outputs, full-screen FA runner)
- Stack: React 18 + Vite 5 + Tailwind CSS v3 + react-markdown + rehype-sanitize + remark-gfm
- Font imports: `IBM Plex Mono` (Google Fonts) + `Inter` (Google Fonts)
