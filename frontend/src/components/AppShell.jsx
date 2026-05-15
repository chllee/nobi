import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
  position: sticky;
  top: 0;
  z-index: 10;

  @media (max-width: 768px) {
    padding: 0 16px;
  }
`

const NavLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`

const Logo = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: #d97706;
  letter-spacing: -0.3px;
`

const BrandSep = styled.span`
  color: #d1d5db;
  font-size: 14px;
  line-height: 1;
`

const OrgName = styled.span`
  font-weight: 500;
  font-size: 14px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;

  @media (max-width: 768px) {
    display: none;
  }
`

const NavItem = styled(NavLink)`
  padding: 5px 10px;
  font-size: 14px;
  color: #6b7280;
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;

  &:hover { background: #fef9c3; color: #78350f; }
  &.active { background: #facc15; color: #92400e; font-weight: 600; }
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

const NavRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`

const UserEmail = styled.span`
  font-size: 13px;
  color: #9ca3af;

  @media (max-width: 768px) {
    display: none;
  }
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

  @media (max-width: 768px) {
    display: none;
  }
`

const HamburgerBtn = styled.button`
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: #374151;
  font-size: 20px;
  line-height: 1;
  border-radius: 6px;
  &:hover { background: #f3f4f6; }

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`

const MobileMenu = styled.div`
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  z-index: 9;
  padding: 8px 12px 16px;

  a {
    display: block;
    padding: 11px 12px;
    font-size: 15px;
    border-radius: 8px;
    margin-bottom: 2px;
    color: #374151;
    text-decoration: none;
  }
  a:hover { background: #fef9c3; color: #78350f; }
  a.active { background: #facc15; color: #92400e; font-weight: 600; }
`

const MobileMenuFooter = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const MobileEmail = styled.span`
  font-size: 12px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const MobileSignOut = styled.button`
  font-size: 13px;
  color: #6b7280;
  background: none;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 6px;
  flex-shrink: 0;
  &:hover { background: #f3f4f6; }
`

const Main = styled.main`
  flex: 1;
  padding: 32px 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: 20px 16px;
  }
`

export default function AppShell() {
  const { user, organisations, canInOrg, isPlatformAdmin, signOut } = useAuth()
  const org = organisations?.[0]
  const isHqAdmin = org && canInOrg('manage_departments', org.id)
  const [pendingInvites, setPendingInvites] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/invitations/incoming')
      .then(data => { if (!cancelled) setPendingInvites(data.length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const navLinks = (
    <>
      <NavItem to="/" end>Dashboard</NavItem>
      <NavItem to="/datasets">Datasets</NavItem>
      <NavItem to="/visualise">Visualise</NavItem>
      {isHqAdmin && <NavItem to="/departments">Departments</NavItem>}
      <NavItem to="/invitations">
        Invitations
        {pendingInvites > 0 && <Badge>{pendingInvites}</Badge>}
      </NavItem>
      {isPlatformAdmin && <NavItem to="/admin">Admin</NavItem>}
    </>
  )

  return (
    <Shell>
      <Nav>
        <NavLeft>
          <Brand>
            <Logo>Nobi</Logo>
            {org?.name && (
              <>
                <BrandSep>/</BrandSep>
                <OrgName>{org.name}</OrgName>
              </>
            )}
          </Brand>
          <NavLinks>
            {navLinks}
          </NavLinks>
        </NavLeft>
        <NavRight>
          <UserEmail>{user?.email}</UserEmail>
          <SignOutButton onClick={signOut}>Sign out</SignOutButton>
          <HamburgerBtn
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? '✕' : '☰'}
          </HamburgerBtn>
        </NavRight>
      </Nav>

      {menuOpen && (
        <MobileMenu>
          {navLinks}
          <MobileMenuFooter>
            <MobileEmail>{user?.email}</MobileEmail>
            <MobileSignOut onClick={signOut}>Sign out</MobileSignOut>
          </MobileMenuFooter>
        </MobileMenu>
      )}

      <Main>
        <Outlet />
      </Main>
    </Shell>
  )
}
