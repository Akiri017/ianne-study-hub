import { Router, Request, Response } from 'express'
import db from '../db/index'

const router = Router({ mergeParams: true })

router.get('/', (req: Request, res: Response) => {
  const moduleId = Number(req.params.moduleId)
  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    res.status(404).json({ error: 'invalid module ID' })
    return
  }

  try {
    const annotations = db.prepare(
      'SELECT id, module_id, selected_text, comment, char_offset, created_at FROM note_annotations WHERE module_id = ? ORDER BY created_at ASC'
    ).all(moduleId)
    res.json({ annotations })
  } catch (err) {
    console.error('[annotations] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', (req: Request, res: Response) => {
  const moduleId = Number(req.params.moduleId)
  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    res.status(404).json({ error: 'invalid module ID' })
    return
  }

  const { selected_text, comment, char_offset } = req.body
  // Using strict undefined check for char_offset as it can be 0
  if (!selected_text || !comment || char_offset === undefined) {
    res.status(400).json({ error: 'missing fields' })
    return
  }

  try {
    db.exec('BEGIN')

    const mod = db.prepare('SELECT id FROM modules WHERE id = ?').get(moduleId)
    if (!mod) {
      db.exec('ROLLBACK')
      res.status(404).json({ error: 'module not found' })
      return
    }

    const result = db.prepare(
      'INSERT INTO note_annotations (module_id, selected_text, comment, char_offset) VALUES (?, ?, ?, ?)'
    ).run(moduleId, selected_text, comment, char_offset)

    db.exec('COMMIT')

    const annotation = db.prepare(
      'SELECT id, module_id, selected_text, comment, char_offset, created_at FROM note_annotations WHERE id = ?'
    ).get(result.lastInsertRowid)

    res.status(201).json({ annotation })
  } catch (err) {
    db.exec('ROLLBACK')
    console.error('[annotations] POST / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:annId', (req: Request, res: Response) => {
  const moduleId = Number(req.params.moduleId)
  const annId = Number(req.params.annId)

  if (!Number.isInteger(moduleId) || moduleId <= 0 || !Number.isInteger(annId) || annId <= 0) {
    res.status(404).json({ error: 'invalid ID' })
    return
  }

  const { comment } = req.body
  if (!comment) {
    res.status(400).json({ error: 'missing comment' })
    return
  }

  try {
    const result = db.prepare(
      'UPDATE note_annotations SET comment = ? WHERE id = ? AND module_id = ?'
    ).run(comment, annId, moduleId)

    if (result.changes === 0) {
      res.status(404).json({ error: 'annotation not found' })
      return
    }

    const annotation = db.prepare(
      'SELECT id, module_id, selected_text, comment, char_offset, created_at FROM note_annotations WHERE id = ?'
    ).get(annId)

    res.json({ annotation })
  } catch (err) {
    console.error('[annotations] PATCH /:annId error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:annId', (req: Request, res: Response) => {
  const moduleId = Number(req.params.moduleId)
  const annId = Number(req.params.annId)

  if (!Number.isInteger(moduleId) || moduleId <= 0 || !Number.isInteger(annId) || annId <= 0) {
    res.status(404).json({ error: 'invalid ID' })
    return
  }

  try {
    const result = db.prepare(
      'DELETE FROM note_annotations WHERE id = ? AND module_id = ?'
    ).run(annId, moduleId)

    if (result.changes === 0) {
      res.status(404).json({ error: 'annotation not found' })
      return
    }

    res.json({ deleted: true })
  } catch (err) {
    console.error('[annotations] DELETE /:annId error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
