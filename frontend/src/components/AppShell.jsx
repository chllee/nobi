import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import styled from 'styled-components'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const Shell = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
`

const Nav = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
`

const NavLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`

const OrgName = styled.span`
  font-weight: 600;
  font-size: 15px;
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const NavItem = styled(NavLink)`
  padding: 5px 10px;
  font-size: 14px;
  color: #6b7280;
  text-decoration: none;
  border-radius: 6px;

  &:hover { background: #f3f4f6; color: #111827; }
  &.active { background: #f3f4f6; color: #111827; font-weight: 500; }
`

const Badge = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  background: #ef4444;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
`

const UserEmail = styled.span`
  font-size: 13px;
  color: #9ca3af;
`

const SignOutButton = styled.button`
  font-size: 14px;
  color: #6b7280;
  background: none;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 6px;
  &:hover { background: #f3f4f6; }
`

const Main = styled.main`
  flex: 1;
  padding: 32px 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
`

export default function AppShell() {
  const { user, organisations, canInOrg, signOut } = useAuth()
  const org = organisations[0]
  const isHqAdmin = org && canInOrg('manage_departments', org.id)
  const [pendingInvites, setPendingInvites] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/invitations/incoming')
      .then(data => { if (!cancelled) setPendingInvites(data.length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <Shell>
      <Nav>
        <NavLeft>
          <OrgName>{org?.name ?? '…'}</OrgName>
          <NavLinks>
            <NavItem to="/" end>Dashboard</NavItem>
            <NavItem to="/datasets">Datasets</NavItem>
            <NavItem to="/visualise">Visualise</NavItem>
            {isHqAdmin && <NavItem to="/departments">Departments</NavItem>}
            <NavItem to="/invitations">
              Invitations
              {pendingInvites > 0 && <Badge>{pendingInvites}</Badge>}
            </NavItem>
          </NavLinks>
        </NavLeft>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <UserEmail>{user?.email}</UserEmail>
          <SignOutButton onClick={signOut}>Sign out</SignOutButton>
        </div>
      </Nav>
      <Main>
        <Outlet />
      </Main>
    </Shell>
  )
}
