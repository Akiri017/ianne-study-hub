import { Router } from 'express'

const router = Router()

// GET /api/subjects
router.get('/', (_req, res) => {
  res.json({ subjects: [] })
})

// POST /api/subjects
router.post('/', (_req, res) => {
  res.status(201).json({ subject: null })
})

// DELETE /api/subjects/:id
router.delete('/:id', (_req, res) => {
  res.json({ deleted: true })
})

export default router
