import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute, { MembershipGuard, PlatformAdminGuard } from './components/ProtectedRoute'
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
import AdminPage from './pages/AdminPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      // Platform admin — auth required, no org membership needed
      {
        element: <PlatformAdminGuard />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/admin', element: <AdminPage /> },
            ],
          },
        ],
      },
      // Regular app — auth + org membership required
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
