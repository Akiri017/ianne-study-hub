/**
 * SubjectView — displays a single subject's modules and provides a file upload zone.
 * Route: /subjects/:subjectId
 *
 * Layout:
 *   Header (subject name + module count)
 *   UploadZone (click-to-upload PDF/DOCX)
 *   Module list (sorted newest-first)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import SectionLabel from '../components/ui/SectionLabel'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import ModuleCard from '../components/modules/ModuleCard'
import { getSubjects, getModules, uploadModule, createMultiModuleQuiz, getSubjectQuizzes, deleteSubject } from '../lib/api'
import type { Module, QuizSummary } from '../lib/api'
import { useAppContext } from '../lib/app-context'

// ---------------------------------------------------------------------------
// UploadZone
// ---------------------------------------------------------------------------

interface UploadZoneProps {
  subjectId: number
  onUploadSuccess: () => void
}

function UploadZone({ subjectId, onUploadSuccess }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // null = no file chosen yet
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setError(null)

    if (!file) return

    // Validate MIME / extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      setError('Only PDF and DOCX files are supported.')
      return
    }

    // 20 MB limit (20 * 1024 * 1024 bytes)
    if (file.size > 20 * 1024 * 1024) {
      setError('File is too large. Maximum size is 20 MB.')
      return
    }

    setSelectedFile(file)
    // Pre-fill title with the filename (without extension) for convenience
    const defaultTitle = file.name.replace(/\.[^/.]+$/, '')
    setTitle(defaultTitle)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please enter a title before uploading.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const result = await uploadModule(subjectId, selectedFile, trimmedTitle)
      if ('error' in result) {
        throw new Error((result as { error: string }).error)
      }

      // Reset state and tell parent to refresh module list
      setSelectedFile(null)
      setTitle('')
      // Clear the file input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploadSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setTitle('')
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone — click to open file picker */}
      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openFilePicker()
        }}
        className={[
          'border-dashed rounded-md p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors duration-100',
          error
            ? 'border-2 border-error'
            : 'border-2 border-border-strong hover:border-accent',
        ].join(' ')}
        aria-label="Upload PDF or DOCX file"
      >
        <span className="font-mono text-xs font-semibold text-text-muted tracking-widest uppercase">
          {uploading
            ? `Uploading ${selectedFile?.name ?? ''}…`
            : selectedFile
            ? selectedFile.name
            : 'Upload PDF or DOCX'}
        </span>
        {!uploading && (
          <span className="text-text-muted text-xs font-mono">
            Max 20MB · PDF and DOCX only
          </span>
        )}
        {uploading && (
          // Simple spinner using the Button component's spinner pattern
          <svg className="animate-spin h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Error message */}
      {error && (
        <p className="text-error text-xs font-mono">{error}</p>
      )}

      {/* Title input + upload button — only shown after a file is selected */}
      {selectedFile && !uploading && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="module-title"
              className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase"
            >
              Title
            </label>
            <input
              id="module-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Module title"
              maxLength={200}
              className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              loading={uploading}
            >
              Upload
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton — 3 placeholder bars while modules fetch
// ---------------------------------------------------------------------------

function ModuleListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading modules">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-md bg-bg-elevated animate-pulse" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MultiModuleQuizModal
// ---------------------------------------------------------------------------

interface MultiModuleQuizModalProps {
  isOpen: boolean
  onClose: () => void
  subjectId: number
  modules: Module[]
  onQuizCreated: (quizId: number) => void
}

function MultiModuleQuizModal({
  isOpen,
  onClose,
  modules,
  onQuizCreated,
}: MultiModuleQuizModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [questionCount, setQuestionCount] = useState(10)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens so stale selections don't linger
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set())
      setQuestionCount(10)
      setTitle('')
      setError(null)
    }
  }, [isOpen])

  const toggleModule = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const canGenerate = selectedIds.size >= 2 && !loading

  const handleGenerate = async () => {
    if (!canGenerate) return
    setLoading(true)
    setError(null)

    try {
      const result = await createMultiModuleQuiz({
        module_ids: Array.from(selectedIds),
        question_count: questionCount,
        title: title.trim() || undefined,
      })

      if ('error' in result) {
        setError(result.error)
        return
      }

      onQuizCreated(result.quiz_id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" title="Generate Multi-Module Quiz">
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div>
          <h2 className="text-text-primary text-base font-semibold">Generate Multi-Module Quiz</h2>
          <p className="text-text-muted text-xs font-mono mt-1">Select at least 2 modules to combine.</p>
        </div>

        {/* Module checklist */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Modules</SectionLabel>
          <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
            {modules.map((mod) => (
              <label
                key={mod.id}
                className="flex items-center gap-3 p-3 rounded-md border border-border-default bg-bg-subtle hover:border-border-strong cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(mod.id)}
                  onChange={() => toggleModule(mod.id)}
                  className="accent-accent w-4 h-4 shrink-0"
                />
                <span className="text-text-primary text-sm flex-1 truncate">{mod.title}</span>
                <Badge variant="default">{mod.file_type}</Badge>
              </label>
            ))}
          </div>
          {selectedIds.size < 2 && (
            <p className="text-text-muted text-xs font-mono">
              {selectedIds.size === 0
                ? 'No modules selected.'
                : '1 module selected — select at least one more.'}
            </p>
          )}
        </div>

        {/* Question count */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="mmq-question-count"
            className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase"
          >
            Question Count
          </label>
          <input
            id="mmq-question-count"
            type="number"
            min={1}
            max={100}
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors w-28"
          />
        </div>

        {/* Optional title */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="mmq-title"
            className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase"
          >
            Quiz Title (optional)
          </label>
          <input
            id="mmq-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-generated if empty"
            maxLength={80}
            className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors"
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-error text-xs font-mono">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={!canGenerate}
            loading={loading}
          >
            {loading ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// SubjectView
// ---------------------------------------------------------------------------

export default function SubjectView() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { setBreadcrumb } = useAppContext()

  const numericSubjectId = Number(subjectId)

  // Subject name — try router state first (set by Sidebar NavLink),
  // then fall back to fetching all subjects
  const [subjectName, setSubjectName] = useState<string>(
    (location.state as { subjectName?: string } | null)?.subjectName ?? ''
  )

  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [quizModalOpen, setQuizModalOpen] = useState(false)
  const [quizSuccessMsg, setQuizSuccessMsg] = useState<string | null>(null)
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(true)



  // Delete subject state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Push real subject name into the Topbar breadcrumb; clear on unmount
  useEffect(() => {
    if (subjectName) {
      setBreadcrumb({ subject: subjectName })
    }
    return () => { setBreadcrumb({}) }
  }, [subjectName, setBreadcrumb])

  const fetchModules = useCallback(async () => {
    if (!numericSubjectId) return
    try {
      const data = await getModules(numericSubjectId)
      // Newest first
      setModules([...(data.modules ?? [])].reverse())
      setFetchError(null)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load modules.')
    } finally {
      setLoading(false)
    }
  }, [numericSubjectId])

  // Fetch subject name if it wasn't passed via router state
  useEffect(() => {
    if (subjectName) return // already have it
    getSubjects()
      .then((data) => {
        const subject = data.subjects.find((s) => s.id === numericSubjectId)
        if (subject) setSubjectName(subject.name)
      })
      .catch(() => {
        // Non-critical — breadcrumb will just be empty
      })
  }, [numericSubjectId, subjectName])

  useEffect(() => {
    fetchModules()
  }, [fetchModules])

  const fetchQuizzes = useCallback(async () => {
    if (!numericSubjectId) return
    try {
      const data = await getSubjectQuizzes(numericSubjectId)
      setQuizzes(data.quizzes ?? [])
    } catch {
      // Non-critical — quiz list stays empty
    } finally {
      setQuizzesLoading(false)
    }
  }, [numericSubjectId])

  useEffect(() => {
    fetchQuizzes()
  }, [fetchQuizzes])



  const handleDeleteSubject = async () => {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await deleteSubject(numericSubjectId)
      navigate('/')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed. Please try again.')
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-text-primary text-xl font-semibold">
          {subjectName || `Subject ${subjectId}`}
        </h1>
        <p className="text-text-secondary text-xs font-mono">
          {loading ? '…' : `${modules.length} module${modules.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Upload zone */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Upload Module</SectionLabel>
        <UploadZone
          subjectId={numericSubjectId}
          onUploadSuccess={() => {
            setLoading(true)
            fetchModules()
          }}
        />
      </div>

      {/* Module list */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Modules</SectionLabel>
          {modules.length >= 2 && (
            <Button variant="secondary" size="sm" onClick={() => setQuizModalOpen(true)}>
              Generate Multi-Module Quiz
            </Button>
          )}
        </div>

        {/* Success message after quiz creation — auto-clears after 3s */}
        {quizSuccessMsg && (
          <p className="text-success text-xs font-mono">{quizSuccessMsg}</p>
        )}

        {loading && <ModuleListSkeleton />}

        {!loading && fetchError && (
          <p className="text-error text-xs font-mono">{fetchError}</p>
        )}

        {!loading && !fetchError && modules.length === 0 && (
          <p className="text-text-muted text-sm font-mono">
            No modules yet. Upload a PDF or DOCX to get started.
          </p>
        )}

        {!loading && !fetchError && modules.map((mod) => (
          <ModuleCard key={mod.id} module={mod} subjectId={numericSubjectId} />
        ))}
      </div>



      {/* Quizzes section */}
      {(quizzesLoading || quizzes.length > 0) && (
        <div className="flex flex-col gap-4">
          <SectionLabel>Quizzes</SectionLabel>
          {quizzesLoading && (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 rounded-md bg-bg-elevated animate-pulse" />
              ))}
            </div>
          )}
          {!quizzesLoading && quizzes.map((quiz) => (
            <div key={quiz.id} className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border-default rounded-md">
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-sm truncate">{quiz.title}</p>
                <p className="text-text-muted text-xs font-mono">{quiz.question_count} questions · {quiz.created_at.slice(0, 10)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/quizzes/${quiz.id}/run`)}>
                Run
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Delete Subject */}
      <div className="flex justify-start pt-4 border-t border-border-default">
        <Button
          variant="danger"
          size="sm"
          onClick={() => { setDeleteModalOpen(true); setDeleteError(null) }}
        >
          Delete Subject
        </Button>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { if (!deleteLoading) setDeleteModalOpen(false) }}
        title="Delete Subject"
        maxWidth="sm"
      >
        <div className="flex flex-col gap-6 p-6">
          <div>
            <h2 className="text-text-primary text-base font-semibold">Delete Subject</h2>
            <p className="text-text-secondary text-sm mt-2">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-text-primary">
                {subjectName || `Subject ${subjectId}`}
              </span>
              ? All modules and outputs will be permanently deleted.
            </p>
          </div>

          {deleteError && (
            <p className="text-error text-xs font-mono">{deleteError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteSubject}
              loading={deleteLoading}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Multi-module quiz modal */}
      <MultiModuleQuizModal
        isOpen={quizModalOpen}
        onClose={() => setQuizModalOpen(false)}
        subjectId={numericSubjectId}
        modules={modules}
        onQuizCreated={(_quizId) => {
          setQuizSuccessMsg('Quiz created!')
          setTimeout(() => setQuizSuccessMsg(null), 3000)
          fetchQuizzes()
        }}
      />
    </div>
  )
}
