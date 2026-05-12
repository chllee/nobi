import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import DatasetsPage from './pages/DatasetsPage'
import VisualisePage from './pages/VisualisePage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/datasets', element: <DatasetsPage /> },
          { path: '/visualise', element: <VisualisePage /> },
        ],
      },
    ],
  },
])

export default router
