import { Router } from 'express'

const router = Router({ mergeParams: true })

// POST /api/modules/:moduleId/generate
router.post('/', (_req, res) => {
  res.status(200).json({ message: 'stub — SSE streaming implemented in later task' })
})

// POST /api/generate/multi-module-quiz
export const multiModuleQuiz = Router()
multiModuleQuiz.post('/multi-module-quiz', (_req, res) => {
  res.status(200).json({ message: 'stub' })
})

// POST /api/outputs/:outputId/regenerate
export const regenerate = Router({ mergeParams: true })
regenerate.post('/', (_req, res) => {
  res.status(200).json({ message: 'stub' })
})

export default router
