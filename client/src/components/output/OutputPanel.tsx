/**
 * OutputPanel — renders one of three AI output types (prescan / notes / quiz)
 * for a given module. Handles the full lifecycle:
 *   idle (not generated) → streaming → generated (view/edit/regenerate)
 *
 * The parent (ModuleView) passes existingOutput when the output has already
 * been generated and persisted. After a new generation completes, onOutputSaved
 * is called so the parent can refetch and repopulate existingOutput with the
 * real persisted record (including its id).
 */

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import SectionLabel from '../ui/SectionLabel'
import { patchOutput, generateQuizWeakPointReasons, bulkCreateWeakPoints } from '../../lib/api'
import { useStreamingOutput } from '../../hooks/useStreamingOutput'
import type { AiOutput, QuizQuestion } from '../../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutputPanelProps {
  outputType: 'prescan' | 'notes' | 'quiz'
  moduleId: number
  subjectId?: number
  /** Pass the already-persisted output if it exists for this module+type. */
  existingOutput?: AiOutput | null
  /** Triggered after generation or save so the parent can refetch module data. */
  onOutputSaved?: (output: AiOutput) => void
}

// ---------------------------------------------------------------------------
// Copy config per output type
// ---------------------------------------------------------------------------

const OUTPUT_DESCRIPTIONS: Record<string, string> = {
  prescan: 'Generate a pre-scan summary — headings and key terms only. Read in 3–5 minutes before studying.',
  notes: 'Generate structured notes — bottom-up concept ordering with explicit connections.',
  quiz: 'Generate a quiz for this module.',
}

const OUTPUT_LABELS: Record<string, string> = {
  prescan: 'PRE-SCAN SUMMARY',
  notes: 'STRUCTURED NOTES',
  quiz: 'QUIZ',
}

// ---------------------------------------------------------------------------
// InlineQuiz — interactive quiz runner embedded in the output panel.
// No session tracking — purely a practice mode.
// ---------------------------------------------------------------------------

interface InlineQuizAnswerState {
  userAnswer: string
  correct: boolean
  revealed: boolean
}

interface InlineQuizProps {
  content: string
  subjectId?: number
}

function InlineQuiz({ content, subjectId }: InlineQuizProps) {
  let questions: QuizQuestion[] = []
  try {
    questions = JSON.parse(content)
  } catch {
    return (
      <pre className="text-text-primary text-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {content}
      </pre>
    )
  }

  const [phase, setPhase] = useState<'intro' | 'running' | 'complete'>('intro')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, InlineQuizAnswerState>>({})
  const [shortInput, setShortInput] = useState('')
  const [isLoggingAll, setIsLoggingAll] = useState(false)
  const [allLogged, setAllLogged] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const handleMcqAnswer = (choice: string) => {
    const correct = choice.trim() === questions[currentIdx].answer.trim()
    setAnswers((prev) => ({ ...prev, [currentIdx]: { userAnswer: choice, correct, revealed: true } }))
  }

  const handleShortSubmit = (userAnswer: string) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { userAnswer, correct: false, revealed: false } }))
  }

  const handleSelfMark = (correct: boolean) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { ...prev[currentIdx], correct, revealed: true } }))
  }

  const canAdvance = answers[currentIdx]?.revealed ?? false

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1)
      setShortInput('')
    } else {
      setPhase('complete')
    }
  }

  const handleRestart = () => {
    setPhase('intro')
    setCurrentIdx(0)
    setAnswers({})
    setShortInput('')
  }

  const score = Object.values(answers).filter((a) => a.correct).length

  if (phase === 'intro') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 px-6 text-center">
        <div>
          <p className="text-text-primary text-base font-semibold">{questions.length} Questions</p>
          <p className="text-text-muted text-xs font-mono mt-1">MCQ + short-answer mix</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setPhase('running')}>
          Start Quiz
        </Button>
      </div>
    )
  }

  if (phase === 'complete') {
    const pct = Math.round((score / questions.length) * 100)
    const wrongIndices = questions.map((_, i) => i).filter((i) => !answers[i]?.correct)

    const handleLogAll = async () => {
      if (!subjectId) return
      setIsLoggingAll(true)
      setLogError(null)
      try {
        const payload = wrongIndices.map((i) => ({
          id: questions[i].id,
          question: questions[i].question,
          correctAnswer: questions[i].answer,
          userAnswer: answers[i]?.userAnswer ?? '',
          topic: questions[i].topic,
        }))
        const results = await generateQuizWeakPointReasons(payload)
        const resultMap = new Map(results.map((r) => [r.id, r.why_missed]))
        const weakPoints = wrongIndices.map((i) => {
          const q = questions[i]
          return {
            topic: q.topic,
            what_went_wrong: `Incorrectly answered: "${q.question}"`,
            why_missed: resultMap.get(q.id) ?? 'Could not determine — review manually.',
            fix: `Correct answer: "${q.answer}"`,
            status: 'Open' as const,
          }
        })
        await bulkCreateWeakPoints(subjectId, weakPoints)
        setAllLogged(true)
      } catch (err) {
        setLogError(err instanceof Error ? err.message : 'Failed to log weak points.')
      } finally {
        setIsLoggingAll(false)
      }
    }

    return (
      <div className="flex flex-col gap-6 py-8 px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-text-primary text-3xl font-mono font-semibold">{score}/{questions.length}</p>
          <p className={`text-xl font-mono font-semibold ${pct >= 70 ? 'text-emerald-400' : 'text-red-400'}`}>{pct}%</p>
        </div>

        {wrongIndices.length === 0 && (
          <p className="text-emerald-400 text-xs font-mono text-center">Perfect score — no weak points to log!</p>
        )}

        {wrongIndices.length > 0 && (
          <div className="flex flex-col gap-3">
            {subjectId ? (
              <button
                onClick={handleLogAll}
                disabled={isLoggingAll || allLogged}
                className={`w-full py-2 px-4 rounded-md text-xs font-mono font-semibold border transition-colors ${
                  allLogged
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 cursor-default'
                    : isLoggingAll
                      ? 'border-border-default bg-bg-subtle text-text-muted cursor-default'
                      : 'border-accent bg-accent/10 text-accent hover:bg-accent hover:text-white'
                }`}
              >
                {allLogged
                  ? `✓ All ${wrongIndices.length} logged to Weak Points`
                  : isLoggingAll
                    ? 'Generating insights…'
                    : `Log All ${wrongIndices.length} to Weak Points`}
              </button>
            ) : (
              <p className="text-text-muted text-xs font-mono text-center">Bulk logging unavailable — no subject linked.</p>
            )}
            {logError && <p className="text-red-400 text-xs font-mono text-center">{logError}</p>}

            <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest">Incorrect ({wrongIndices.length})</p>
            {wrongIndices.map((i) => {
              const q = questions[i]
              return (
                <div key={i} className="bg-bg-subtle border border-border-default rounded-md p-3 flex flex-col gap-1">
                  <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">{q.topic}</span>
                  <p className="text-text-primary text-xs">{q.question}</p>
                  <p className="text-xs"><span className="font-mono text-emerald-400">Answer: </span>{q.answer}</p>
                  {answers[i]?.userAnswer && (
                    <p className="text-xs"><span className="font-mono text-red-400">You said: </span>{answers[i].userAnswer}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={handleRestart}>Retry</Button>
        </div>
      </div>
    )
  }

  const q = questions[currentIdx]
  const answerState = answers[currentIdx] ?? null
  const answered = answerState?.revealed ?? false

  return (
    <div className="flex flex-col gap-4 py-4 px-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-muted">
          {currentIdx + 1} / {questions.length}
        </span>
        <span className="font-mono text-[10px] bg-bg-subtle text-text-muted px-2 py-0.5 rounded-sm uppercase">
          {q.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
        </span>
      </div>

      <div className="h-1 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <span className="font-mono text-[10px] text-text-muted bg-bg-subtle px-2 py-1 rounded-sm uppercase tracking-widest self-start">
        {q.topic}
      </span>

      <p className="text-text-primary text-sm leading-relaxed">{q.question}</p>

      {q.type === 'mcq' && (
        <div className="flex flex-col gap-2">
          {(q.choices ?? []).map((choice, idx) => {
            let cls = 'flex items-start gap-3 p-3 rounded-md border text-sm text-left w-full transition-colors duration-100 '
            if (!answered) {
              cls += 'border-border-default bg-bg-surface hover:border-accent hover:bg-bg-elevated cursor-pointer'
            } else {
              const isCorrect = choice === q.answer
              const isSelected = choice === answerState?.userAnswer
              if (isCorrect) cls += 'border-emerald-500 bg-emerald-500/10 text-emerald-400 cursor-default'
              else if (isSelected) cls += 'border-red-500 bg-red-500/10 text-red-400 cursor-default'
              else cls += 'border-border-default bg-bg-surface text-text-muted cursor-default opacity-60'
            }
            return (
              <button key={choice} className={cls} onClick={() => !answered && handleMcqAnswer(choice)} disabled={answered}>
                <span className="font-mono text-xs shrink-0 mt-0.5 opacity-60">{String.fromCharCode(65 + idx)}.</span>
                <span>{choice}</span>
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'short_answer' && (
        answerState === null ? (
          <div className="flex flex-col gap-3">
            <textarea
              value={shortInput}
              onChange={(e) => setShortInput(e.target.value)}
              rows={3}
              placeholder="Type your answer here…"
              className="px-3 py-2 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors resize-none"
            />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => shortInput.trim() && handleShortSubmit(shortInput.trim())} disabled={!shortInput.trim()}>
                Submit
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-md bg-bg-subtle border border-border-default">
              <p className="text-xs font-mono text-text-muted uppercase tracking-widest mb-1">Your answer</p>
              <p className="text-text-secondary text-sm">{answerState.userAnswer}</p>
            </div>
            <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/40">
              <p className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-1">Correct answer</p>
              <p className="text-emerald-300 text-sm">{q.answer}</p>
            </div>
            {!answerState.revealed && (
              <div className="flex gap-2 justify-end items-center">
                <p className="text-text-muted text-xs font-mono mr-auto">Did you get it right?</p>
                <Button variant="danger" size="sm" onClick={() => handleSelfMark(false)}>✗ No</Button>
                <Button variant="primary" size="sm" onClick={() => handleSelfMark(true)}>✓ Yes</Button>
              </div>
            )}
          </div>
        )
      )}

      {answered && (
        <p className={`text-sm font-mono text-center ${answerState.correct ? 'text-emerald-400' : 'text-red-400'}`}>
          {answerState.correct ? '✓ Correct!' : '✗ Incorrect'}
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={handleNext} disabled={!canAdvance}>
          {currentIdx < questions.length - 1 ? 'Next →' : 'Finish'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OutputContent — renders the saved content with react-markdown.
// Quiz outputs render as an interactive inline quiz.
// ---------------------------------------------------------------------------

interface OutputContentProps {
  content: string
  outputType: 'prescan' | 'notes' | 'quiz'
  subjectId?: number
}

function OutputContent({ content, outputType, subjectId }: OutputContentProps) {
  if (outputType === 'quiz') {
    return <InlineQuiz content={content} subjectId={subjectId} />
  }

  return (
    <div className="prose-output text-text-primary text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-text-secondary [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-text-primary [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary">
      <ReactMarkdown
        components={{
          h3({ children, ...props }) {
            const text = String(children)
            const isAiNote = text.startsWith('[AI Note]')
            if (isAiNote) {
              return (
                <h3 {...props} className="text-sm font-medium mt-3 mb-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shrink-0">AI Note</span>
                  <span className="text-amber-300">{text.replace('[AI Note]', '').trim()}</span>
                </h3>
              )
            }
            return <h3 {...props}>{children}</h3>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OutputEditor — inline textarea for editing saved output content
// ---------------------------------------------------------------------------

interface OutputEditorProps {
  initialContent: string
  outputId: number
  onSaved: (newContent: string) => void
  onCancel: () => void
}

function OutputEditor({ initialContent, outputId, onSaved, onCancel }: OutputEditorProps) {
  const [value, setValue] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await patchOutput(outputId, value)
      onSaved(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full h-96 p-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm font-mono resize-y focus:outline-none focus:border-border-strong transition-colors"
        spellCheck={false}
        aria-label="Edit output content"
      />

      {error && (
        <p className="text-error text-xs font-mono">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RegenerateModal — prompts for optional instructions before re-streaming
// ---------------------------------------------------------------------------

interface RegenerateModalProps {
  isOpen: boolean
  onClose: () => void
  onRegenerate: (instructions: string) => void
  isLoading: boolean
}

function RegenerateModal({ isOpen, onClose, onRegenerate, isLoading }: RegenerateModalProps) {
  const [instructions, setInstructions] = useState('')

  const handleSubmit = () => {
    onRegenerate(instructions)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" title="REGENERATE WITH INSTRUCTIONS">
      <div className="p-6 flex flex-col gap-4">
        <SectionLabel>Regenerate with Instructions</SectionLabel>

        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="What should the AI change? (optional)"
          rows={4}
          className="w-full p-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors resize-none"
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isLoading}>
            Regenerate
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// OutputPanel — main export
// ---------------------------------------------------------------------------

export default function OutputPanel({
  outputType,
  moduleId,
  subjectId,
  existingOutput,
  onOutputSaved,
}: OutputPanelProps) {
  // Controls the quiz question count input (only shown when not yet generated)
  const [questionCount, setQuestionCount] = useState(10)

  // Inline editor toggle
  const [isEditing, setIsEditing] = useState(false)
  // Optimistic content update after save (avoids full refetch just for display)
  const [editedContent, setEditedContent] = useState<string | null>(null)

  // Regenerate modal
  const [regenModalOpen, setRegenModalOpen] = useState(false)

  const { state, content, error, startStream, reset } = useStreamingOutput()

  // Guard: only call onOutputSaved once per completed stream.
  // Without this, the callback fires on every re-render while state===done,
  // creating an infinite refetch loop between this component and the parent.
  const didNotifyParent = useRef(false)
  useEffect(() => {
    if (state === 'done' && !didNotifyParent.current) {
      didNotifyParent.current = true
      onOutputSaved?.({
        id: existingOutput?.id ?? -1, // sentinel if new — parent replaces via refetch
        module_id: moduleId,
        output_type: outputType,
        content,
        instructions: null,
        created_at: existingOutput?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    // Reset the guard when a new stream starts so the next generation can notify too
    if (state === 'streaming') {
      didNotifyParent.current = false
    }
  }, [state, existingOutput, onOutputSaved]) // eslint-disable-line react-hooks/exhaustive-deps

  // The content to display in the generated/editing view.
  // Priority: optimistic edited content → streamed content (if stream finished) → existingOutput from parent
  const resolvedContent = editedContent ?? (state === 'done' ? content : existingOutput?.content) ?? content

  // Determine which "phase" the UI is in:
  //   - 'not-generated': no existingOutput and stream is idle/error
  //   - 'streaming': SSE stream is active
  //   - 'generated': have content (either from existingOutput or a completed stream)
  const isStreaming = state === 'streaming'
  const hasContent = !!existingOutput || state === 'done'

  const handleGenerate = () => {
    reset()
    setEditedContent(null)
    const body: Record<string, unknown> = { output_type: outputType }
    if (outputType === 'quiz') body.question_count = questionCount
    startStream(`/api/modules/${moduleId}/generate`, body)
  }

  const handleRegenerate = (instructions: string) => {
    if (!existingOutput) return
    reset()
    setEditedContent(null)
    setIsEditing(false)
    setRegenModalOpen(false)
    startStream(`/api/outputs/${existingOutput.id}/regenerate`, { instructions })
  }

  // ---------------------------------------------------------------------------
  // Render: NOT GENERATED (idle, no existing output)
  // ---------------------------------------------------------------------------

  if (!hasContent && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-6 py-12 px-8">
        <div className="text-center flex flex-col gap-2 max-w-md">
          <SectionLabel className="mb-1">{OUTPUT_LABELS[outputType]}</SectionLabel>
          <p className="text-text-secondary text-sm leading-relaxed">
            {OUTPUT_DESCRIPTIONS[outputType]}
          </p>
        </div>

        {/* Quiz-only: question count input */}
        {outputType === 'quiz' && (
          <div className="flex flex-col items-center gap-2">
            <label
              htmlFor="question-count"
              className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase"
            >
              Question Count
            </label>
            <input
              id="question-count"
              type="number"
              min={1}
              max={50}
              value={questionCount}
              onChange={(e) => setQuestionCount(Math.min(50, Math.max(1, Number(e.target.value))))}
              className="w-24 h-9 px-3 text-center rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm font-mono focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>
        )}

        {error && (
          <p className="text-error text-xs font-mono text-center">{error}</p>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={handleGenerate}
          className="w-full max-w-xs font-mono tracking-widest"
        >
          Generate
        </Button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: STREAMING
  // ---------------------------------------------------------------------------

  if (isStreaming) {
    return (
      <div className="flex flex-col gap-4 p-6">
        {/* Generating label */}
        <div className="flex items-center justify-between">
          <SectionLabel>{OUTPUT_LABELS[outputType]}</SectionLabel>
          <span className="font-mono text-xs text-accent animate-pulse tracking-widest">
            GENERATING…
          </span>
        </div>

        {/* Live content with blinking cursor */}
        <div className="text-text-primary text-sm font-mono whitespace-pre-wrap leading-relaxed min-h-[200px]">
          {content}
          <span className="animate-pulse text-accent">▋</span>
        </div>

        {/*
          TODO (PM): wire isStreaming state up to AppShell → StatusBar so the
          global streaming indicator shows while this panel is active.
        */}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: GENERATED (view / edit)
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SectionLabel>{OUTPUT_LABELS[outputType]}</SectionLabel>

        {/* Only show edit/regen if we have a real persisted output (with real id) */}
        {existingOutput && existingOutput.id > 0 && (
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsEditing(true)
                    setEditedContent(resolvedContent)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRegenModalOpen(true)}
                >
                  Regenerate
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content area — editor or rendered markdown */}
      {isEditing && existingOutput ? (
        <OutputEditor
          initialContent={editedContent ?? existingOutput.content}
          outputId={existingOutput.id}
          onSaved={(newContent) => {
            setEditedContent(newContent)
            setIsEditing(false)
            // Notify parent to refetch for consistency (timestamps, etc.)
            if (onOutputSaved) {
              onOutputSaved({ ...existingOutput, content: newContent })
            }
          }}
          onCancel={() => {
            setIsEditing(false)
            setEditedContent(null)
          }}
        />
      ) : (
        <OutputContent content={resolvedContent} outputType={outputType} subjectId={subjectId} />
      )}

      {/* Regenerate modal */}
      {existingOutput && (
        <RegenerateModal
          isOpen={regenModalOpen}
          onClose={() => setRegenModalOpen(false)}
          onRegenerate={handleRegenerate}
          isLoading={isStreaming}
        />
      )}
    </div>
  )
}
