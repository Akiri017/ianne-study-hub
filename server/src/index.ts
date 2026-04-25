import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import { errorHandler } from './middleware/error-handler'

// Route modules
import subjectsRouter from './routes/subjects'
import modulesRouter, { deleteModule } from './routes/modules'
import generateRouter, { multiModuleQuiz, regenerate } from './routes/generate'
import outputsRouter from './routes/outputs'
import quizzesRouter, { subjectQuizzes } from './routes/quizzes'
import weakPointsRouter, { subjectWeakPoints } from './routes/weak-points'
import tasksRouter, { subjectTasks } from './routes/tasks'
import reviewerRouter from './routes/reviewer'
import aiWeakPointsRouter from './routes/ai-weak-points'

const app = express()
const PORT = process.env.PORT ?? 3000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// Serve uploaded files as static assets
app.use('/uploads', express.static(path.resolve(__dirname, '../../uploads')))

// ── Routes ────────────────────────────────────────────────────────────────────
const api = express.Router()

// Subjects
api.use('/subjects', subjectsRouter)

// Subject-scoped nested resources
api.use('/subjects/:subjectId/modules', modulesRouter)
api.use('/subjects/:subjectId/quizzes', subjectQuizzes)
api.use('/subjects/:subjectId/weak-points', subjectWeakPoints)
api.use('/subjects/:subjectId/tasks', subjectTasks)
api.use('/subjects/:subjectId/reviewer', reviewerRouter)

// Modules (standalone delete)
api.use('/modules', deleteModule)

// AI generation
api.use('/modules/:moduleId/generate', generateRouter)
api.use('/generate', multiModuleQuiz)
api.use('/outputs/:outputId/regenerate', regenerate)

// Outputs
api.use('/outputs', outputsRouter)

// Quizzes (standalone)
api.use('/quizzes', quizzesRouter)

// Weak points (standalone patch/delete)
api.use('/weak-points', weakPointsRouter)

// Tasks (global + standalone)
api.use('/tasks', tasksRouter)

// AI utilities
api.use('/ai/quiz-weak-points', aiWeakPointsRouter)

app.use('/api', api)

// ── Error handler — must be last ──────────────────────────────────────────────
app.use(errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`)
})

export default app
