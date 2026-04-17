/**
 * QuizRunner — full-screen FA session runner.
 * Route: /quizzes/:quizId/run
 *
 * Flow: loading → intro → running (one question at a time) → complete (score screen)
 *
 * MCQ: click a choice → lock choices + reveal correct/incorrect → Next
 * Short answer: type answer → Submit → reveal correct answer → self-mark → Next
 *
 * On complete: score is saved to fa_sessions. Wrong-answer cards offer
 * a "Log Weak Point" button that pre-fills the weak point create form.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getQuiz, createSession, completeSession, createWeakPoint, getSubjects,
  type Quiz, type QuizQuestion, type SessionAnswer, type Subject,
} from '../lib/api'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunnerPhase = 'loading' | 'intro' | 'running' | 'complete'

interface AnswerState {
  userAnswer: string
  correct: boolean
  revealed: boolean
}

// ---------------------------------------------------------------------------
// WeakPointModal — pre-filled from a wrong question
// ---------------------------------------------------------------------------

interface WeakPointModalProps {
  question: QuizQuestion
  subjects: Subject[]
  onSaved: (questionId: string) => void
  onClose: () => void
}

function WeakPointModal({ question, subjects, onSaved, onClose }: WeakPointModalProps) {
  const [topic, setTopic] = useState(question.topic)
  const [whatWentWrong, setWhatWentWrong] = useState(`Incorrectly answered: "${question.question}"`)
  const [whyMissed, setWhyMissed] = useState('')
  const [fix, setFix] = useState(`Correct answer: "${question.answer}"`)
  const [subjectId, setSubjectId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!topic.trim() || !whatWentWrong.trim() || !whyMissed.trim() || !fix.trim()) {
      setError('All fields are required.')
      return
    }
    if (subjectId === '') {
      setError('Please select a subject.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await createWeakPoint(subjectId as number, {
        topic: topic.trim(),
        what_went_wrong: whatWentWrong.trim(),
        why_missed: whyMissed.trim(),
        fix: fix.trim(),
        status: 'Open',
      })
      if ('error' in result) throw new Error(result.error)
      onSaved(question.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} maxWidth="md" title="Log Weak Point">
      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase">Topic</label>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
            className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase">What went wrong</label>
          <textarea value={whatWentWrong} onChange={(e) => setWhatWentWrong(e.target.value)} rows={2}
            className="px-3 py-2 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors resize-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase">Why I missed it</label>
          <textarea value={whyMissed} onChange={(e) => setWhyMissed(e.target.value)} rows={2}
            placeholder="e.g. Confused with similar concept, didn't re-read notes…"
            className="px-3 py-2 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors resize-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase">Fix / correct answer</label>
          <textarea value={fix} onChange={(e) => setFix(e.target.value)} rows={2}
            className="px-3 py-2 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors resize-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase">Subject</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors">
            <option value="">Select subject…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {error && <p className="text-error text-xs font-mono">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={loading}>Save Weak Point</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// MCQCard
// ---------------------------------------------------------------------------

interface MCQCardProps {
  question: QuizQuestion
  answerState: AnswerState | null
  onAnswer: (choice: string) => void
}

function MCQCard({ question, answerState, onAnswer }: MCQCardProps) {
  const choices = question.choices ?? []
  const answered = answerState?.revealed ?? false

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-primary text-base leading-relaxed">{question.question}</p>
      <div className="flex flex-col gap-2">
        {choices.map((choice, idx) => {
          let cls = 'flex items-start gap-3 p-3 rounded-md border text-sm text-left w-full transition-colors duration-100 '
          if (!answered) {
            cls += 'border-border-default bg-bg-surface hover:border-accent hover:bg-bg-elevated cursor-pointer'
          } else {
            const isCorrect = choice === question.answer
            const isSelected = choice === answerState?.userAnswer
            if (isCorrect) {
              cls += 'border-emerald-500 bg-emerald-500/10 text-emerald-400 cursor-default'
            } else if (isSelected && !isCorrect) {
              cls += 'border-red-500 bg-red-500/10 text-red-400 cursor-default'
            } else {
              cls += 'border-border-default bg-bg-surface text-text-muted cursor-default opacity-60'
            }
          }
          return (
            <button key={choice} className={cls} onClick={() => !answered && onAnswer(choice)} disabled={answered}>
              <span className="font-mono text-xs shrink-0 mt-0.5 opacity-60">
                {String.fromCharCode(65 + idx)}.
              </span>
              <span className="flex-1 text-left">{choice}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ShortAnswerCard
// ---------------------------------------------------------------------------

interface ShortAnswerCardProps {
  question: QuizQuestion
  answerState: AnswerState | null
  onSubmit: (userAnswer: string) => void
  onSelfMark: (correct: boolean) => void
  localAnswer: string
  setLocalAnswer: (v: string) => void
}

function ShortAnswerCard({ question, answerState, onSubmit, onSelfMark, localAnswer, setLocalAnswer }: ShortAnswerCardProps) {
  const submitted = answerState !== null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-primary text-base leading-relaxed">{question.question}</p>
      {!submitted ? (
        <div className="flex flex-col gap-3">
          <textarea value={localAnswer} onChange={(e) => setLocalAnswer(e.target.value)} rows={4}
            placeholder="Type your answer here…"
            className="px-3 py-2 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong transition-colors resize-none" />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={() => localAnswer.trim() && onSubmit(localAnswer.trim())} disabled={!localAnswer.trim()}>
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
            <p className="text-emerald-300 text-sm">{question.answer}</p>
          </div>
          {!answerState.revealed ? (
            <div className="flex gap-2 justify-end items-center">
              <p className="text-text-muted text-xs font-mono mr-auto">Did you get it right?</p>
              <Button variant="ghost" size="sm" onClick={() => onSelfMark(false)}>
                <span className="text-red-400">✗ No</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => onSelfMark(true)}>
                ✓ Yes
              </Button>
            </div>
          ) : (
            <p className={`text-xs font-mono text-right ${answerState.correct ? 'text-emerald-400' : 'text-red-400'}`}>
              Marked as {answerState.correct ? 'correct' : 'incorrect'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuizRunner
// ---------------------------------------------------------------------------

export default function QuizRunner() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const numericQuizId = Number(quizId)

  const [phase, setPhase] = useState<RunnerPhase>('loading')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({})
  const [shortAnswerInput, setShortAnswerInput] = useState('')

  const [weakPointQuestion, setWeakPointQuestion] = useState<QuizQuestion | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loggedWeakPoints, setLoggedWeakPoints] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!numericQuizId) return
    Promise.all([getQuiz(numericQuizId), getSubjects()])
      .then(([{ quiz: q }, { subjects: s }]) => {
        setQuiz(q)
        setSubjects(s)
        setPhase('intro')
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load quiz.')
      })
  }, [numericQuizId])

  const startSession = useCallback(async () => {
    if (!quiz) return
    try {
      const { session } = await createSession(numericQuizId)
      setSessionId(session.id)
      setCurrentIdx(0)
      setAnswers({})
      setShortAnswerInput('')
      setLoggedWeakPoints(new Set())
      setPhase('running')
    } catch {
      setLoadError('Failed to start session. Please try again.')
    }
  }, [quiz, numericQuizId])

  const handleMcqAnswer = (choice: string) => {
    if (!quiz) return
    const correct = choice.trim() === quiz.questions[currentIdx].answer.trim()
    setAnswers((prev) => ({ ...prev, [currentIdx]: { userAnswer: choice, correct, revealed: true } }))
  }

  const handleShortAnswerSubmit = (userAnswer: string) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { userAnswer, correct: false, revealed: false } }))
  }

  const handleSelfMark = (correct: boolean) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { ...prev[currentIdx], correct, revealed: true } }))
  }

  const canAdvance = () => answers[currentIdx]?.revealed ?? false

  const handleNext = async () => {
    if (!quiz || !canAdvance()) return
    if (currentIdx < quiz.questions.length - 1) {
      setCurrentIdx((i) => i + 1)
      setShortAnswerInput('')
      return
    }
    // Last question — finalize session
    const sessionAnswers: SessionAnswer[] = quiz.questions.map((q, i) => ({
      question_id: q.id,
      user_answer: answers[i]?.userAnswer ?? '',
      correct: answers[i]?.correct ?? false,
    }))
    const score = sessionAnswers.filter((a) => a.correct).length
    if (sessionId) {
      try {
        await completeSession(numericQuizId, sessionId, { score, answers: sessionAnswers })
      } catch {
        // Non-fatal — show score screen anyway
      }
    }
    setPhase('complete')
  }

  const score = quiz ? Object.values(answers).filter((a) => a.correct).length : 0
  const wrongIndices = quiz ? quiz.questions.map((_, i) => i).filter((i) => !answers[i]?.correct) : []

  return (
    <>
      {/* Loading */}
      {phase === 'loading' && (
        <div className="flex-1 flex items-center justify-center p-8">
          {loadError ? (
            <div className="text-center flex flex-col gap-3">
              <p className="text-error text-sm font-mono">{loadError}</p>
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>Go Back</Button>
            </div>
          ) : (
            <p className="text-text-muted text-sm font-mono animate-pulse">Loading quiz…</p>
          )}
        </div>
      )}

      {/* Intro */}
      {phase === 'intro' && quiz && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full flex flex-col gap-6 text-center">
            <div>
              <h1 className="text-text-primary text-2xl font-semibold">{quiz.title}</h1>
              <p className="text-text-muted text-sm font-mono mt-1">{quiz.question_count} questions</p>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed">
              Answer each question, then review the correct answer before advancing.
              Short-answer questions require self-marking.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={startSession}>Start Quiz</Button>
            </div>
          </div>
        </div>
      )}

      {/* Running */}
      {phase === 'running' && quiz && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-8 gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-text-muted">
                Question {currentIdx + 1} of {quiz.questions.length}
              </span>
              <span className="font-mono text-xs text-text-muted bg-bg-subtle px-2 py-0.5 rounded-sm uppercase">
                {quiz.questions[currentIdx].type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${((currentIdx + 1) / quiz.questions.length) * 100}%` }}
              />
            </div>
          </div>

          <span className="font-mono text-[10px] text-text-muted bg-bg-subtle px-2 py-1 rounded-sm uppercase tracking-widest self-start">
            {quiz.questions[currentIdx].topic}
          </span>

          <div className="bg-bg-surface border border-border-default rounded-md p-6 flex flex-col gap-4">
            {quiz.questions[currentIdx].type === 'mcq' ? (
              <MCQCard
                question={quiz.questions[currentIdx]}
                answerState={answers[currentIdx] ?? null}
                onAnswer={handleMcqAnswer}
              />
            ) : (
              <ShortAnswerCard
                question={quiz.questions[currentIdx]}
                answerState={answers[currentIdx] ?? null}
                onSubmit={handleShortAnswerSubmit}
                onSelfMark={handleSelfMark}
                localAnswer={shortAnswerInput}
                setLocalAnswer={setShortAnswerInput}
              />
            )}
          </div>

          {answers[currentIdx]?.revealed && (
            <p className={`text-sm font-mono text-center ${answers[currentIdx].correct ? 'text-emerald-400' : 'text-red-400'}`}>
              {answers[currentIdx].correct ? '✓ Correct!' : '✗ Incorrect'}
            </p>
          )}

          <div className="flex justify-between items-center">
            <button
              onClick={() => navigate(-1)}
              className="text-xs text-text-muted hover:text-text-secondary font-mono transition-colors"
            >
              ← Exit
            </button>
            <Button variant="primary" size="sm" onClick={handleNext} disabled={!canAdvance()}>
              {currentIdx < quiz.questions.length - 1 ? 'Next →' : 'Finish'}
            </Button>
          </div>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && quiz && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-8 gap-8 overflow-y-auto">
          <div className="bg-bg-surface border border-border-default rounded-md p-8 flex flex-col items-center gap-3 text-center">
            <span className="text-5xl font-mono font-semibold text-text-primary">
              {score}/{quiz.questions.length}
            </span>
            <span className={`text-2xl font-mono font-semibold ${Math.round((score / quiz.questions.length) * 100) >= 70 ? 'text-emerald-400' : 'text-red-400'}`}>
              {Math.round((score / quiz.questions.length) * 100)}%
            </span>
            <p className="text-text-muted text-sm">{quiz.title}</p>
          </div>

          {wrongIndices.length === 0 && (
            <p className="text-emerald-400 text-sm font-mono text-center">
              Perfect score — no weak points to log!
            </p>
          )}

          {wrongIndices.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-mono text-xs text-text-secondary tracking-widest uppercase">
                Incorrect ({wrongIndices.length})
              </h2>
              {wrongIndices.map((i) => {
                const q = quiz.questions[i]
                const logged = loggedWeakPoints.has(q.id)
                return (
                  <div key={i} className="bg-bg-surface border border-border-default rounded-md p-4 flex gap-3">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">{q.topic}</span>
                      <p className="text-text-primary text-sm">{q.question}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        <span className="font-mono text-emerald-400">Answer: </span>
                        {q.answer}
                      </p>
                      {answers[i]?.userAnswer && (
                        <p className="text-xs text-text-muted">
                          <span className="font-mono text-red-400">You said: </span>
                          {answers[i].userAnswer}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => !logged && setWeakPointQuestion(q)}
                      disabled={logged}
                      className={`shrink-0 self-start text-xs font-mono px-2 py-1 rounded border transition-colors ${
                        logged
                          ? 'border-border-default text-text-muted cursor-default'
                          : 'border-accent text-accent hover:bg-accent hover:text-white'
                      }`}
                    >
                      {logged ? '✓ Logged' : 'Log Weak Point'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>Back</Button>
            <Button variant="secondary" size="sm" onClick={() => {
              setAnswers({})
              setCurrentIdx(0)
              setShortAnswerInput('')
              setLoggedWeakPoints(new Set())
              startSession()
            }}>
              Retry Quiz
            </Button>
          </div>
        </div>
      )}

      {/* Weak point modal — overlays any phase */}
      {weakPointQuestion && (
        <WeakPointModal
          question={weakPointQuestion}
          subjects={subjects}
          onSaved={(qId) => {
            setLoggedWeakPoints((prev) => new Set([...prev, qId]))
            setWeakPointQuestion(null)
          }}
          onClose={() => setWeakPointQuestion(null)}
        />
      )}
    </>
  )
}
