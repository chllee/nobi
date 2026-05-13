import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../lib/api'
import ChartRenderer from '../components/ChartRenderer'

const PageTitle = styled.h2`
  margin: 0 0 24px;
  font-size: 20px;
  font-weight: 600;
`

const TopRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const Layout = styled.div`
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 24px;
  align-items: start;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`

const Panel = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
`

const PanelBody = styled.div`
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  display: block;
  margin-bottom: 6px;
`

const Select = styled.select`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  outline: none;
`

const ChatLog = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 340px;
  overflow-y: auto;
  padding-right: 4px;
`

const Bubble = styled.div`
  padding: 10px 13px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 100%;
  align-self: ${p => p.$role === 'user' ? 'flex-end' : 'flex-start'};
  background: ${p => p.$role === 'user' ? '#1a1a1a' : '#f3f4f6'};
  color: ${p => p.$role === 'user' ? '#fff' : '#111827'};
`

const Divider = styled.div`
  height: 1px;
  background: #e5e7eb;
`

const InputArea = styled.div`
  padding: 16px 20px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
`

const Textarea = styled.textarea`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  resize: none;
  line-height: 1.5;
  font-family: inherit;
  outline: none;
  min-height: 60px;
`

const SendButton = styled.button`
  padding: 8px 16px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`

const ChartCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 24px;
  min-height: 460px;
  display: flex;
  align-items: ${p => p.$empty ? 'center' : 'flex-start'};
  justify-content: ${p => p.$empty ? 'center' : 'flex-start'};
`

const Placeholder = styled.p`
  font-size: 14px;
  color: #9ca3af;
  text-align: center;
`

const ErrorMsg = styled.p`
  font-size: 13px;
  color: #dc2626;
  margin: 0;
`

const ALL_DEPTS = '__all__'

export default function VisualisePage() {
  const [departments, setDepartments] = useState([])
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS)
  const [datasets, setDatasets] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [datasetRows, setDatasetRows] = useState(null)
  const [messages, setMessages] = useState([])
  const [currentConfig, setCurrentConfig] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const chatBottomRef = useRef(null)

  useEffect(() => {
    apiFetch('/api/departments').then(setDepartments).catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    const url = deptFilter === ALL_DEPTS ? '/api/datasets' : `/api/datasets?department_id=${deptFilter}`
    apiFetch(url).then(setDatasets).catch(() => setDatasets([]))
    setSelectedId('')
    setMessages([])
    setCurrentConfig(null)
    setDatasetRows(null)
  }, [deptFilter])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleDatasetChange(e) {
    const id = e.target.value
    setSelectedId(id)
    setMessages([])
    setCurrentConfig(null)
    setDatasetRows(null)
    setError(null)
    if (!id) return
    try {
      const d = await apiFetch(`/api/datasets/${id}`)
      setDatasetRows(d.rows)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSend() {
    if (!prompt.trim() || !selectedId || sending) return
    const userMsg = { role: 'user', content: prompt.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setPrompt('')
    setSending(true)
    setError(null)
    try {
      const { explanation, config } = await apiFetch('/api/visualise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: selectedId, messages: next }),
      })
      setMessages(m => [...m, { role: 'assistant', content: explanation }])
      if (config) setCurrentConfig(config)
    } catch (err) {
      setError(err.message)
      setMessages(m => m.slice(0, -1))
      setPrompt(userMsg.content)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasChart = currentConfig && datasetRows
  const noDatasets = datasets.length === 0

  return (
    <div>
      <PageTitle>Visualise</PageTitle>

      <TopRow>
        <Label style={{ marginBottom: 0 }}>Department</Label>
        <Select
          style={{ width: 260 }}
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
        >
          <option value={ALL_DEPTS}>All departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}{d.is_hq ? ' (HQ)' : ''}</option>
          ))}
        </Select>
      </TopRow>

      <Layout>
        <Panel>
          <PanelBody>
            <div>
              <Label htmlFor="dataset-select">Dataset</Label>
              <Select id="dataset-select" value={selectedId} onChange={handleDatasetChange}>
                <option value="">{noDatasets ? 'No datasets available' : 'Select a dataset…'}</option>
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>

            {messages.length > 0 && (
              <ChatLog>
                {messages.map((m, i) => (
                  <Bubble key={i} $role={m.role}>{m.content}</Bubble>
                ))}
                <div ref={chatBottomRef} />
              </ChatLog>
            )}

            {error && <ErrorMsg>{error}</ErrorMsg>}
          </PanelBody>

          <Divider />

          <InputArea>
            <Textarea
              placeholder={selectedId ? 'Ask to visualise your data… (Enter to send)' : 'Select a dataset first'}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!selectedId || sending}
            />
            <SendButton onClick={handleSend} disabled={!prompt.trim() || !selectedId || sending}>
              {sending ? '…' : 'Send'}
            </SendButton>
          </InputArea>
        </Panel>

        <ChartCard $empty={!hasChart}>
          {hasChart
            ? <ChartRenderer config={currentConfig} rows={datasetRows} />
            : <Placeholder>
                {selectedId
                  ? 'Send a prompt to generate a chart'
                  : 'Select a dataset and send a prompt to get started'}
              </Placeholder>}
        </ChartCard>
      </Layout>
    </div>
  )
}
