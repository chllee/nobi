import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const Page = styled.div`
  max-width: 560px;
  margin: 60px auto;
  padding: 0 24px;
`

const Section = styled.section`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 24px;
  margin-bottom: 24px;
`

const SectionTitle = styled.h3`
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
`

const Sub = styled.p`
  margin: 0 0 16px;
  font-size: 13px;
  color: #6b7280;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
`

const Input = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  &:focus { border-color: #3b82f6; }
`

const Button = styled.button`
  padding: 8px 14px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`

const InviteRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`

const InviteInfo = styled.div`
  font-size: 14px;
  color: #111827;
`

const InviteMeta = styled.div`
  font-size: 12px;
  color: #6b7280;
`

const Btn = styled.button`
  padding: 5px 12px;
  font-size: 13px;
  border-radius: 5px;
  border: 1px solid ${p => p.$variant === 'accept' ? '#86efac' : '#d1d5db'};
  background: ${p => p.$variant === 'accept' ? '#f0fdf4' : '#f9fafb'};
  color: ${p => p.$variant === 'accept' ? '#15803d' : '#374151'};
  cursor: pointer;
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
`

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)
  const [invites, setInvites] = useState([])
  const [error, setError] = useState(null)

  async function loadInvites() {
    try {
      const data = await apiFetch('/api/invitations/incoming')
      setInvites(data)
    } catch (e) {
      setInvites([])
    }
  }

  useEffect(() => { loadInvites() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!orgName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await apiFetch('/api/organisations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      })
      await refresh()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleAccept(id) {
    setError(null)
    try {
      await apiFetch(`/api/invitations/${id}/accept`, { method: 'POST' })
      await refresh()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
      loadInvites()
    }
  }

  async function handleReject(id) {
    await apiFetch(`/api/invitations/${id}/reject`, { method: 'POST' })
    loadInvites()
  }

  return (
    <Page>
      <Section>
        <SectionTitle>Create your organisation</SectionTitle>
        <Sub>You'll be the HQ admin with full access to every department you create.</Sub>
        <form onSubmit={handleCreate}>
          <Row>
            <Input
              placeholder="Organisation name"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              disabled={creating}
            />
            <Button type="submit" disabled={creating || !orgName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </Row>
        </form>
      </Section>

      {invites.length > 0 && (
        <Section>
          <SectionTitle>Pending invitations</SectionTitle>
          <Sub>Accepting an invitation will add you to that organisation.</Sub>
          {invites.map(inv => (
            <InviteRow key={inv.id}>
              <InviteInfo>
                <div>
                  <strong>{inv.department.organisation.name}</strong> · {inv.department.name}
                </div>
                <InviteMeta>
                  Role: {inv.role}
                  {inv.inviter?.email ? ` · invited by ${inv.inviter.display_name || inv.inviter.email}` : ''}
                </InviteMeta>
              </InviteInfo>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn $variant="accept" onClick={() => handleAccept(inv.id)}>Accept</Btn>
                <Btn onClick={() => handleReject(inv.id)}>Reject</Btn>
              </div>
            </InviteRow>
          ))}
        </Section>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}
    </Page>
  )
}
