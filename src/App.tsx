import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import RaceGoalPage from '@/pages/RaceGoalPage'
import WeeklyTemplatePage from '@/pages/WeeklyTemplatePage'
import TrainingCalendarPage from '@/pages/TrainingCalendarPage'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/race-goal"
        element={
          <ProtectedRoute>
            <RaceGoalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/weekly-template"
        element={
          <ProtectedRoute>
            <WeeklyTemplatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/training-calendar"
        element={
          <ProtectedRoute>
            <TrainingCalendarPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
