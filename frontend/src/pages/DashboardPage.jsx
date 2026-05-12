import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

const Heading = styled.h2`
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
`

const Sub = styled.p`
  margin: 0 0 32px;
  font-size: 14px;
  color: #6b7280;
`

const StatsRow = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`

const StatCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px 28px;
  min-width: 160px;
`

const StatValue = styled.p`
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  color: #111827;
`

const StatLabel = styled.p`
  margin: 0;
  font-size: 13px;
  color: #6b7280;
`

export default function DashboardPage() {
  const { org, role } = useAuth()
  const [datasets, setDatasets] = useState(null)

  useEffect(() => {
    apiFetch('/api/datasets').then(setDatasets).catch(() => setDatasets([]))
  }, [])

  const lastUpload = datasets?.length
    ? new Date(Math.max(...datasets.map(d => new Date(d.uploaded_at))))
        .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : 'None'

  return (
    <div>
      <Heading>Welcome to {org?.name ?? '…'}</Heading>
      <Sub>Role: {role ?? '…'}</Sub>
      <StatsRow>
        <StatCard>
          <StatValue>{datasets === null ? '…' : datasets.length}</StatValue>
          <StatLabel>Datasets</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue style={{ fontSize: 18 }}>{datasets === null ? '…' : lastUpload}</StatValue>
          <StatLabel>Last upload</StatLabel>
        </StatCard>
      </StatsRow>
    </div>
  )
}
