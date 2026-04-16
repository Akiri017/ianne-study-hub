import { Router } from 'express'

const router = Router({ mergeParams: true })

// GET /api/subjects/:subjectId/modules
router.get('/', (_req, res) => {
  res.json({ modules: [] })
})

// POST /api/subjects/:subjectId/modules/upload
router.post('/upload', (_req, res) => {
  res.status(201).json({ module: null })
})

// DELETE /api/modules/:id — mounted separately at root level
export const deleteModule = Router()
deleteModule.delete('/:id', (_req, res) => {
  res.json({ deleted: true })
})

export default router
