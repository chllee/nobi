import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const WAITING_KEY = 'nobi_waiting_for_invite'

const Page = styled.div`
  max-width: 560px;
  margin: 60px auto;
  padding: 0 24px;
`

const Header = styled.div`
  margin-bottom: 32px;
`

const Welcome = styled.h1`
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
`

const WelcomeSub = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
`

const Section = styled.section`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 24px;
  margin-bottom: 16px;
`

const SectionTitle = styled.h3`
  margin: 0 0 4px;
  font-size: 15px;
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
  &:focus { border-color: #facc15; }
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

const Divider = styled.div`
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
  margin: 8px 0;
  position: relative;

  &::before, &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 44%;
    height: 1px;
    background: #e5e7eb;
  }
  &::before { left: 0; }
  &::after { right: 0; }
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

const NoInviteNote = styled.p`
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
`

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
`

const CreateToggle = styled.button`
  width: 100%;
  padding: 12px;
  background: #fff;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  text-align: center;
  &:hover { border-color: #9ca3af; color: #374151; }
`

const WaitLink = styled.button`
  display: block;
  margin: 20px auto 0;
  background: none;
  border: none;
  font-size: 13px;
  color: #9ca3af;
  cursor: pointer;
  text-decoration: underline;
  &:hover { color: #6b7280; }
`

const RefreshBtn = styled.button`
  margin-top: 12px;
  padding: 7px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  &:hover { background: #f3f4f6; }
`

const BackLink = styled.button`
  display: block;
  margin: 16px auto 0;
  background: none;
  border: none;
  font-size: 13px;
  color: #9ca3af;
  cursor: pointer;
  text-decoration: underline;
  &:hover { color: #6b7280; }
`

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [waiting, setWaiting] = useState(() => localStorage.getItem(WAITING_KEY) === 'true')
  const [invites, setInvites] = useState([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [error, setError] = useState(null)

  async function loadInvites() {
    setInvitesLoading(true)
    try {
      const data = await apiFetch('/api/invitations/incoming')
      setInvites(data)
      if (!waiting && data.length === 0) setShowCreate(true)
    } catch {
      setInvites([])
      if (!waiting) setShowCreate(true)
    } finally {
      setInvitesLoading(false)
    }
  }

  useEffect(() => { loadInvites() }, [])

  function handleWait() {
    localStorage.setItem(WAITING_KEY, 'true')
    setWaiting(true)
  }

  function handleStopWaiting() {
    localStorage.removeItem(WAITING_KEY)
    setWaiting(false)
    setShowCreate(true)
  }

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
      localStorage.removeItem(WAITING_KEY)
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
      localStorage.removeItem(WAITING_KEY)
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

  const inviteList = (
    <>
      {invitesLoading ? (
        <NoInviteNote>Checking for invitations…</NoInviteNote>
      ) : invites.length === 0 ? (
        <NoInviteNote>No pending invitations yet.</NoInviteNote>
      ) : (
        invites.map(inv => (
          <InviteRow key={inv.id}>
            <InviteInfo>
              <div>
                <strong>{inv.department?.organisation?.name}</strong> · {inv.department?.name}
              </div>
              <InviteMeta>
                Role: {inv.role}
                {inv.inviter?.display_name ? ` · invited by ${inv.inviter.display_name}` : ''}
              </InviteMeta>
            </InviteInfo>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn $variant="accept" onClick={() => handleAccept(inv.id)}>Accept</Btn>
              <Btn onClick={() => handleReject(inv.id)}>Decline</Btn>
            </div>
          </InviteRow>
        ))
      )}
    </>
  )

  if (waiting) {
    return (
      <Page>
        <Header>
          <Welcome>Waiting for an invitation</Welcome>
          <WelcomeSub>
            Ask your organisation admin to invite you. Once they do, your invitation
            will appear below. Refresh to check for new invitations.
          </WelcomeSub>
        </Header>

        <Section>
          <SectionTitle>Pending invitations</SectionTitle>
          <Sub>Accept an invitation to join an existing organisation.</Sub>
          {inviteList}
          <RefreshBtn onClick={loadInvites}>
            {invitesLoading ? 'Checking…' : 'Refresh invitations'}
          </RefreshBtn>
        </Section>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <BackLink onClick={handleStopWaiting}>
          Create an organisation instead
        </BackLink>
      </Page>
    )
  }

  return (
    <Page>
      <Header>
        <Welcome>Welcome to Nobi</Welcome>
        <WelcomeSub>
          Accept a pending invitation from your organisation, or create a new one of your own.
        </WelcomeSub>
      </Header>

      <Section>
        <SectionTitle>Pending invitations</SectionTitle>
        <Sub>Accept an invitation to join an existing organisation.</Sub>
        {inviteList}
      </Section>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {!invitesLoading && (
        showCreate ? (
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
                  autoFocus={invites.length === 0}
                />
                <Button type="submit" disabled={creating || !orgName.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </Button>
              </Row>
            </form>
          </Section>
        ) : (
          <>
            <Divider>or</Divider>
            <CreateToggle onClick={() => setShowCreate(true)}>
              + Create a new organisation
            </CreateToggle>
          </>
        )
      )}

      {!invitesLoading && (
        <WaitLink onClick={handleWait}>
          I'm waiting for an invitation
        </WaitLink>
      )}
    </Page>
  )
}
