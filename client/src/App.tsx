import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import SubjectView from './pages/SubjectView'
import ModuleView from './pages/ModuleView'
import QuizRunner from './pages/QuizRunner'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/subjects/:subjectId" element={<SubjectView />} />
          <Route path="/subjects/:subjectId/modules/:moduleId" element={<ModuleView />} />
          <Route path="/quizzes/:quizId/run" element={<QuizRunner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
