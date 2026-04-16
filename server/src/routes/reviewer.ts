import { Router } from 'express'

// POST /api/subjects/:subjectId/reviewer/export
const router = Router({ mergeParams: true })

router.post('/export', (_req, res) => {
  res.status(200).json({ message: 'stub — export implemented in later task' })
})

export default router
