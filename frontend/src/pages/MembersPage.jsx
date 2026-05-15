import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const Section = styled.section`
  margin-bottom: 32px;
`

const SectionTitle = styled.h3`
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
`

const Card = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
`

const Input = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
`

const Select = styled.select`
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
`

const Button = styled.button`
  padding: 8px 14px;
  background: #facc15;
  color: #1a1a1a;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #eab308; }
`

const SearchResult = styled.div`
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: #f9fafb; }
`

const TableWrap = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
`

const Td = styled.td`
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
`

const PermLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #374151;
  margin-right: 10px;
  cursor: pointer;
`

const TextBtn = styled.button`
  background: none;
  border: none;
  font-size: 13px;
  color: ${p => p.$danger ? '#dc2626' : '#b45309'};
  cursor: pointer;
  padding: 0;
  margin-right: 12px;
  &:hover { text-decoration: underline; }
`

const SaveBtn = styled.button`
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: none;
  background: #facc15;
  color: #1a1a1a;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #eab308; }
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
`

const EXTRA_PERMS = ['upload', 'edit', 'delete', 'manage_members']

export default function MembersPage() {
  const { id: deptId } = useParams()
  const { user, canInDept, refresh } = useAuth()
  const [dept, setDept] = useState(null)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [inviteRole, setInviteRole] = useState('viewer')
  const [pendingRoles, setPendingRoles] = useState({})

  async function load() {
    setError(null)
    try {
      const [depts, mem, inv] = await Promise.all([
        apiFetch(`/api/departments`),
        apiFetch(`/api/departments/${deptId}/members`),
        apiFetch(`/api/invitations/department/${deptId}`).catch(() => []),
      ])
      setDept(depts.find(d => d.id === deptId) || null)
      setMembers(mem)
      setInvites(inv)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [deptId])

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return }
    const handle = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(search.trim())}`)
        setResults(data)
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(handle)
  }, [search])

  const canManage = dept && canInDept('manage_members', dept)

  async function handleInvite(invitee) {
    setError(null)
    try {
      await apiFetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitee_user_id: invitee.id,
          department_id: dept.id,
          role: inviteRole,
        }),
      })
      setSearch('')
      setResults([])
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRoleChange(memberId, role) {
    setError(null)
    try {
      await apiFetch(`/api/memberships/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      setPendingRoles(p => { const n = { ...p }; delete n[memberId]; return n })
      load()
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  function setPendingRole(memberId, role) {
    setPendingRoles(p => ({ ...p, [memberId]: role }))
  }

  function cancelPendingRole(memberId) {
    setPendingRoles(p => { const n = { ...p }; delete n[memberId]; return n })
  }

  async function handlePermToggle(member, perm, checked) {
    const next = checked
      ? [...new Set([...(member.extra_permissions || []), perm])]
      : (member.extra_permissions || []).filter(p => p !== perm)
    try {
      await apiFetch(`/api/memberships/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_permissions: next }),
      })
      load()
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRemove(memberId) {
    if (!confirm('Remove this member from the department?')) return
    setError(null)
    try {
      await apiFetch(`/api/memberships/${memberId}`, { method: 'DELETE' })
      load()
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRevoke(inviteId) {
    try {
      await apiFetch(`/api/invitations/${inviteId}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!dept) return (
    <p style={{ color: error ? '#dc2626' : '#6b7280', fontSize: 14 }}>
      {error || 'Loading…'}
    </p>
  )

  return (
    <div>
      {canManage && (
        <Section>
          <SectionTitle>Invite a user</SectionTitle>
          <Card>
            <Row>
              <Input
                placeholder="Search by email or name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <Select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </Select>
            </Row>
            {results.length > 0 && results.map(u => (
              <SearchResult key={u.id} onClick={() => handleInvite(u)}>
                <span>{u.display_name || u.email} <span style={{ color: '#9ca3af' }}>· {u.email}</span></span>
                <Button>Invite</Button>
              </SearchResult>
            ))}
          </Card>
        </Section>
      )}

      <Section>
        <SectionTitle>Members</SectionTitle>
        <Card>
          <TableWrap><Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Extra permissions</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <Td>
                    <div>{m.profile.display_name || m.profile.email}</div>
                    <div style={{ color: '#9ca3af', fontSize: 12 }}>{m.profile.email}</div>
                  </Td>
                  <Td>
                    {canManage ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Select
                          value={pendingRoles[m.id] ?? m.role}
                          onChange={e => setPendingRole(m.id, e.target.value)}
                        >
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                          <option value="admin">admin</option>
                        </Select>
                        {pendingRoles[m.id] !== undefined && pendingRoles[m.id] !== m.role && (
                          <>
                            <SaveBtn onClick={() => handleRoleChange(m.id, pendingRoles[m.id])}>
                              Save
                            </SaveBtn>
                            <TextBtn onClick={() => cancelPendingRole(m.id)}>Cancel</TextBtn>
                          </>
                        )}
                      </div>
                    ) : m.role}
                  </Td>
                  <Td>
                    {canManage
                      ? EXTRA_PERMS.map(p => (
                        <PermLabel key={p}>
                          <input
                            type="checkbox"
                            checked={(m.extra_permissions || []).includes(p)}
                            onChange={e => handlePermToggle(m, p, e.target.checked)}
                          />
                          {p}
                        </PermLabel>
                      ))
                      : (m.extra_permissions || []).join(', ') || '—'
                    }
                  </Td>
                  <Td>
                    {(canManage || m.profile.id === user.id) && (
                      <TextBtn $danger onClick={() => handleRemove(m.id)}>
                        {m.profile.id === user.id ? 'Leave' : 'Remove'}
                      </TextBtn>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table></TableWrap>
        </Card>
      </Section>

      {canManage && invites.length > 0 && (
        <Section>
          <SectionTitle>Pending invitations</SectionTitle>
          <Card>
            <TableWrap><Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Sent</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id}>
                    <Td>
                      <div>{i.invitee.display_name || i.invitee.email}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>{i.invitee.email}</div>
                    </Td>
                    <Td>{i.role}</Td>
                    <Td>{new Date(i.created_at).toLocaleDateString()}</Td>
                    <Td>
                      <TextBtn $danger onClick={() => handleRevoke(i.id)}>Revoke</TextBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table></TableWrap>
          </Card>
        </Section>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}
    </div>
  )
}
