import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const Section = styled.section`
  margin-bottom: 32px;
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
  margin-bottom: 16px;
`

const Input = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
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

const MembersLink = styled(Link)`
  font-size: 13px;
  color: #b45309;
  margin-right: 12px;
  &:hover { text-decoration: underline; }
`

const Tag = styled.span`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 4px;
  margin-left: 8px;
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
`

export default function DepartmentsPage() {
  const { organisations, canInOrg, refresh } = useAuth()
  const org = organisations[0]
  const [departments, setDepartments] = useState([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')

  const isHqAdmin = org && canInOrg('manage_departments', org.id)

  async function load() {
    if (!org) return
    try {
      const data = await apiFetch(`/api/departments?org_id=${org.id}`)
      setDepartments(data)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [org?.id])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      await apiFetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: org.id, name: name.trim() }),
      })
      setName('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(id) {
    if (!editName.trim()) return
    setError(null)
    try {
      await apiFetch(`/api/departments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      setEditing(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this department? Members in it will lose access.')) return
    setError(null)
    try {
      await apiFetch(`/api/departments/${id}`, { method: 'DELETE' })
      load()
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!org) return <p>You must be in an organisation to manage departments.</p>
  if (!isHqAdmin) return <p>Only HQ admins can manage departments.</p>

  return (
    <div>
      <Section>
        <Card>
          <form onSubmit={handleCreate}>
            <Row>
              <Input
                placeholder="New department name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={creating}
              />
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </Row>
          </form>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </Card>
      </Section>

      <Section>
        <Card>
          <TableWrap><Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Created</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {departments.map(d => (
                <tr key={d.id}>
                  <Td>
                    {editing === d.id
                      ? (
                        <Row>
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            autoFocus
                          />
                          <Button onClick={() => handleRename(d.id)}>Save</Button>
                          <TextBtn onClick={() => setEditing(null)}>Cancel</TextBtn>
                        </Row>
                      )
                      : (
                        <span>
                          {d.name}
                          {d.is_hq && <Tag>HQ</Tag>}
                        </span>
                      )
                    }
                  </Td>
                  <Td>{new Date(d.created_at).toLocaleDateString()}</Td>
                  <Td>
                    <MembersLink to={`/departments/${d.id}/members`}>Members</MembersLink>
                    {!d.is_hq && editing !== d.id && (
                      <>
                        <TextBtn onClick={() => { setEditing(d.id); setEditName(d.name) }}>Rename</TextBtn>
                        <TextBtn $danger onClick={() => handleDelete(d.id)}>Delete</TextBtn>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table></TableWrap>
        </Card>
      </Section>
    </div>
  )
}
