import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const PageTitle = styled.h2`
  margin: 0 0 24px;
  font-size: 20px;
  font-weight: 600;
`

const Card = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px;
`

const InviteRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`

const Info = styled.div`
  font-size: 14px;
  color: #111827;
`

const Meta = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
`

const Btn = styled.button`
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 5px;
  border: 1px solid ${p => p.$variant === 'accept' ? '#86efac' : '#d1d5db'};
  background: ${p => p.$variant === 'accept' ? '#f0fdf4' : '#f9fafb'};
  color: ${p => p.$variant === 'accept' ? '#15803d' : '#374151'};
  cursor: pointer;
  margin-left: 6px;
`

const Empty = styled.p`
  color: #9ca3af;
  font-size: 14px;
  margin: 0;
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
`

export default function InvitationsPage() {
  const { refresh } = useAuth()
  const [invites, setInvites] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch('/api/invitations/incoming')
      setInvites(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function accept(id) {
    setError(null)
    try {
      await apiFetch(`/api/invitations/${id}/accept`, { method: 'POST' })
      await refresh()
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function reject(id) {
    setError(null)
    try {
      await apiFetch(`/api/invitations/${id}/reject`, { method: 'POST' })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <PageTitle>Invitations</PageTitle>
      <Card>
        {loading
          ? <Empty>Loading…</Empty>
          : invites.length === 0
            ? <Empty>No pending invitations.</Empty>
            : invites.map(inv => (
              <InviteRow key={inv.id}>
                <Info>
                  <div>
                    <strong>{inv.department.organisation.name}</strong> · {inv.department.name}
                  </div>
                  <Meta>
                    Role: {inv.role}
                    {inv.inviter?.email && ` · invited by ${inv.inviter.display_name || inv.inviter.email}`}
                  </Meta>
                </Info>
                <div>
                  <Btn $variant="accept" onClick={() => accept(inv.id)}>Accept</Btn>
                  <Btn onClick={() => reject(inv.id)}>Reject</Btn>
                </div>
              </InviteRow>
            ))
        }
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>
    </div>
  )
}
