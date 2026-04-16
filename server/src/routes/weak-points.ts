import { Router } from 'express'

const router = Router()

// GET /api/weak-points/:id — standalone; subject-scoped mounted separately
router.patch('/:id', (_req, res) => {
  res.json({ weak_point: null })
})

router.delete('/:id', (_req, res) => {
  res.json({ deleted: true })
})

// Subject-scoped weak points — mounted at /api/subjects/:subjectId/weak-points
export const subjectWeakPoints = Router({ mergeParams: true })
subjectWeakPoints.get('/', (_req, res) => {
  res.json({ weak_points: [] })
})

subjectWeakPoints.post('/', (_req, res) => {
  res.status(201).json({ weak_point: null })
})

export default router
