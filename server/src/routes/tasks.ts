import { Router } from 'express'

const router = Router()

// GET /api/tasks — all tasks across subjects (calendar view)
router.get('/', (_req, res) => {
  res.json({ tasks: [] })
})

// PATCH /api/tasks/:id
router.patch('/:id', (_req, res) => {
  res.json({ task: null })
})

// DELETE /api/tasks/:id
router.delete('/:id', (_req, res) => {
  res.json({ deleted: true })
})

// Subject-scoped tasks — mounted at /api/subjects/:subjectId/tasks
export const subjectTasks = Router({ mergeParams: true })
subjectTasks.get('/', (_req, res) => {
  res.json({ tasks: [] })
})

subjectTasks.post('/', (_req, res) => {
  res.status(201).json({ task: null })
})

export default router
