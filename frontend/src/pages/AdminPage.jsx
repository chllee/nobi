import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../lib/api'


const StatsRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 40px;
  flex-wrap: wrap;
`

const StatCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px 28px;
  min-width: 160px;
`

const StatNum = styled.div`
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
`

const StatLabel = styled.div`
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
`

const Section = styled.section`
  margin-bottom: 40px;
`

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 14px;
`

const TableWrap = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  font-size: 14px;
`

const Th = styled.th`
  text-align: left;
  padding: 10px 16px;
  background: #f9fafb;
  color: #6b7280;
  font-weight: 500;
  border-bottom: 1px solid #e5e7eb;
`

const Td = styled.td`
  padding: 10px 16px;
  border-bottom: 1px solid #f3f4f6;
  color: #111827;
  &:last-child { text-align: right; }
  tr:last-child & { border-bottom: none; }
`

const Badge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$admin ? '#fef3c7' : '#f3f4f6'};
  color: ${p => p.$admin ? '#92400e' : '#374151'};
`

const DeleteBtn = styled.button`
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid #fca5a5;
  background: #fff;
  color: #dc2626;
  cursor: pointer;
  &:hover { background: #fef2f2; }
`

const ToggleBtn = styled.button`
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  &:hover { background: #f3f4f6; }
`

const Confirm = styled.span`
  font-size: 12px;
  margin-right: 6px;
  color: #6b7280;
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
`

export default function AdminPage() {
  const [overview, setOverview] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const [ov, os, us] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch('/api/admin/organisations'),
        apiFetch('/api/admin/users'),
      ])
      setOverview(ov)
      setOrgs(os)
      setUsers(us)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDeleteOrg(id) {
    try {
      await apiFetch(`/api/admin/organisations/${id}`, { method: 'DELETE' })
      setPendingDelete(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleAdmin(id, current) {
    try {
      await apiFetch(`/api/admin/users/${id}/admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_platform_admin: !current }),
      })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {overview && (
        <StatsRow>
          <StatCard>
            <StatNum>{overview.organisations}</StatNum>
            <StatLabel>Organisations</StatLabel>
          </StatCard>
          <StatCard>
            <StatNum>{overview.users}</StatNum>
            <StatLabel>Users</StatLabel>
          </StatCard>
          <StatCard>
            <StatNum>{overview.datasets}</StatNum>
            <StatLabel>Datasets</StatLabel>
          </StatCard>
        </StatsRow>
      )}

      <Section>
        <SectionTitle>All Organisations</SectionTitle>
        <TableWrap><Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Departments</Th>
              <Th>Members</Th>
              <Th>Created</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr><Td colSpan={5} style={{ color: '#9ca3af' }}>No organisations yet.</Td></tr>
            )}
            {orgs.map(o => (
              <tr key={o.id}>
                <Td>{o.name}</Td>
                <Td>{o.department_count}</Td>
                <Td>{o.member_count}</Td>
                <Td>{new Date(o.created_at).toLocaleDateString()}</Td>
                <Td>
                  {pendingDelete === o.id ? (
                    <>
                      <Confirm>Delete "{o.name}"?</Confirm>
                      <DeleteBtn onClick={() => handleDeleteOrg(o.id)}>Yes, delete</DeleteBtn>
                      {' '}
                      <ToggleBtn onClick={() => setPendingDelete(null)}>Cancel</ToggleBtn>
                    </>
                  ) : (
                    <DeleteBtn onClick={() => setPendingDelete(o.id)}>Delete</DeleteBtn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table></TableWrap>
      </Section>

      <Section>
        <SectionTitle>All Users</SectionTitle>
        <TableWrap><Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Organisation</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><Td colSpan={5} style={{ color: '#9ca3af' }}>No users yet.</Td></tr>
            )}
            {users.map(u => {
              const hqMembership = u.memberships.find(m => m.department?.is_hq)
              const orgName = hqMembership?.department?.organisation?.name ?? '—'
              return (
                <tr key={u.id}>
                  <Td>{u.display_name}</Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <Badge $admin={u.is_platform_admin}>
                      {u.is_platform_admin ? 'Platform Admin' : 'User'}
                    </Badge>
                  </Td>
                  <Td>{orgName}</Td>
                  <Td>
                    <ToggleBtn onClick={() => handleToggleAdmin(u.id, u.is_platform_admin)}>
                      {u.is_platform_admin ? 'Remove admin' : 'Make admin'}
                    </ToggleBtn>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table></TableWrap>
      </Section>
    </div>
  )
}
