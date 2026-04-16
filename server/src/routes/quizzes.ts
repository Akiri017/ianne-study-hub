import { Router } from 'express'

const router = Router()

// GET /api/quizzes/:id
router.get('/:id', (_req, res) => {
  res.json({ quiz: null })
})

// POST /api/quizzes/:id/sessions
router.post('/:id/sessions', (_req, res) => {
  res.status(201).json({ session: null })
})

// GET /api/quizzes/:id/sessions/:sessionId
router.get('/:id/sessions/:sessionId', (_req, res) => {
  res.json({ session: null })
})

// GET /api/subjects/:subjectId/quizzes — mounted via subjects router
export const subjectQuizzes = Router({ mergeParams: true })
subjectQuizzes.get('/', (_req, res) => {
  res.json({ quizzes: [] })
})

export default router
