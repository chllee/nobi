import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute, { MembershipGuard } from './components/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import DatasetsPage from './pages/DatasetsPage'
import VisualisePage from './pages/VisualisePage'
import DepartmentsPage from './pages/DepartmentsPage'
import MembersPage from './pages/MembersPage'
import InvitationsPage from './pages/InvitationsPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        element: <MembershipGuard />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/datasets', element: <DatasetsPage /> },
              { path: '/visualise', element: <VisualisePage /> },
              { path: '/departments', element: <DepartmentsPage /> },
              { path: '/departments/:id/members', element: <MembersPage /> },
              { path: '/invitations', element: <InvitationsPage /> },
            ],
          },
        ],
      },
    ],
  },
])

export default router
