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
import { patchOutput } from '../../lib/api'
import { useStreamingOutput } from '../../hooks/useStreamingOutput'
import type { AiOutput } from '../../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutputPanelProps {
  outputType: 'prescan' | 'notes' | 'quiz'
  moduleId: number
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
// OutputContent — renders the saved content with react-markdown.
// Quiz outputs are displayed as formatted JSON in a <pre> block.
// ---------------------------------------------------------------------------

interface OutputContentProps {
  content: string
  outputType: 'prescan' | 'notes' | 'quiz'
}

function OutputContent({ content, outputType }: OutputContentProps) {
  if (outputType === 'quiz') {
    // Render quiz as pretty-printed JSON; fall back to raw string if malformed
    let displayed = content
    try {
      displayed = JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      // content is not valid JSON — show as-is
    }
    return (
      <pre className="text-text-primary text-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {displayed}
      </pre>
    )
  }

  return (
    // Tailwind prose-like overrides applied via className on the wrapper.
    // react-markdown renders to semantic HTML; we style it with Tailwind utilities.
    <div className="prose-output text-text-primary text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-text-secondary [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-text-primary [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary">
      <ReactMarkdown>{content}</ReactMarkdown>
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
          placeholder="What should Claude change? (optional)"
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
  // Without this, the callback fires on every re-render while state===done && !existingOutput,
  // creating an infinite refetch loop between this component and the parent.
  const didNotifyParent = useRef(false)
  useEffect(() => {
    if (state === 'done' && !existingOutput && !didNotifyParent.current) {
      didNotifyParent.current = true
      onOutputSaved?.({
        id: -1, // sentinel — parent replaces via refetch
        module_id: moduleId,
        output_type: outputType,
        content,
        instructions: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    // Reset the guard when a new stream starts so the next generation can notify too
    if (state === 'streaming') {
      didNotifyParent.current = false
    }
  }, [state, existingOutput]) // eslint-disable-line react-hooks/exhaustive-deps

  // The content to display in the generated/editing view.
  // Priority: optimistic edited content → existingOutput from parent → streamed content.
  const resolvedContent = editedContent ?? existingOutput?.content ?? content

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
        <OutputContent content={resolvedContent} outputType={outputType} />
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
