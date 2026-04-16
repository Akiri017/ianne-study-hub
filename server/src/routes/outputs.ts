import { Router } from 'express'

const router = Router()

// GET /api/outputs/:id
router.get('/:id', (_req, res) => {
  res.json({ output: null })
})

// PATCH /api/outputs/:id
router.patch('/:id', (_req, res) => {
  res.json({ output: null })
})

export default router
