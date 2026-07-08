import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../lib/api'
import ChartRenderer from '../components/ChartRenderer'

// ─── styled components ────────────────────────────────────────────────────────

const TopRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const Layout = styled.div`
  display: grid;
  grid-template-columns: 360px 1fr 220px;
  gap: 24px;
  align-items: start;
  @media (max-width: 1024px) { grid-template-columns: 360px 1fr; }
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`

const NavSidebar = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 96px);
  @media (max-width: 768px) {
    position: static;
    max-height: none;
  }
`

const NavHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const NavHeaderTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
`

const AddButton = styled.button`
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #1a1a1a;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #f9fafb; }
`

const NavList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const NavDeleteButton = styled.button`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-right: 4px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: #fee2e2; color: #dc2626; }
`

const NavItemRow = styled.div`
  display: flex;
  align-items: center;
  border-radius: 6px;
  background: ${p => p.$active ? '#eef2ff' : 'transparent'};
  &:hover { background: ${p => p.$active ? '#eef2ff' : '#f3f4f6'}; }
  &:hover ${NavDeleteButton} { opacity: 1; }
`

const NavItemButton = styled.button`
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 8px 6px 8px 10px;
  border: none;
  background: transparent;
  color: ${p => p.$active ? '#4338ca' : '#374151'};
  font-size: 13px;
  font-weight: ${p => p.$active ? '600' : '500'};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const UnsavedDot = styled.span`
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  margin-left: 6px;
  flex-shrink: 0;
`

const NavEmpty = styled.p`
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
`

const Panel = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 96px);
  @media (max-width: 768px) {
    position: static;
    max-height: none;
  }
`

const PanelBody = styled.div`
  padding: 20px;
  flex: 1;
  min-height: 0;
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
  flex: 1;
  min-height: 0;
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

const MiddleColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
`

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  min-width: 0;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ChartCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 24px 24px 16px;
  min-height: 460px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: ${p => p.$empty ? 'center' : 'stretch'};
  justify-content: ${p => p.$empty ? 'center' : 'flex-start'};
  grid-column: ${p => p.$span ? '1 / -1' : 'auto'};
  scroll-margin-top: 88px;
`

const ToggleButton = styled.button`
  align-self: flex-start;
  font-size: 12px;
  font-weight: 500;
  color: #4338ca;
  background: #eef2ff;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  &:hover { background: #e0e7ff; }
`

const ChartCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  align-self: stretch;
`

const ChartCardTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`

const EditButton = styled.button`
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: #f3f4f6; color: #374151; }
`

const TitleInput = styled.input`
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 3px 6px;
  outline: none;
  &:focus { border-color: #facc15; }
`

const SaveBtn = styled.button`
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid #86efac;
  background: ${p => p.$saving ? '#d1d5db' : '#f0fdf4'};
  color: ${p => p.$saving ? '#6b7280' : '#15803d'};
  cursor: ${p => p.$saving ? 'not-allowed' : 'pointer'};
  opacity: ${p => p.$saving ? 0.6 : 1};
  &:hover:not(:disabled) { background: #dcfce7; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const Placeholder = styled.p`
  font-size: 14px;
  color: #9ca3af;
  text-align: center;
`

const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 6px;
`

const PreviewTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
`

const PreviewMeta = styled.span`
  font-size: 12px;
  color: #6b7280;
`

const TableWrap = styled.div`
  overflow: auto;
  flex: 1;
  min-height: 0;
  min-width: 0;
  max-height: 450px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
`

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
`

const Th = styled.th`
  position: sticky;
  top: 0;
  background: #f9fafb;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
  z-index: 1;
`

const Td = styled.td`
  padding: 6px 10px;
  border-bottom: 1px solid #f3f4f6;
  color: #111827;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  background: ${p => p.$odd ? '#f9fafb' : '#fff'};
`

const ColumnTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
`

const ColumnTag = styled.span`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 500;
`

const ErrorMsg = styled.p`
  font-size: 13px;
  color: #dc2626;
  margin: 0;
`

// ─── Comments styles ──────────────────────────────────────────────────────────

const CommentsSection = styled.div`
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  align-self: stretch;
`

const CommentsTitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
  display: block;
`

const CommentItem = styled.div`
  padding: 6px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-of-type { border-bottom: none; }
`

const CommentAuthor = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-right: 6px;
`

const CommentText = styled.span`
  font-size: 13px;
  color: #111827;
`

const CommentTime = styled.span`
  font-size: 11px;
  color: #9ca3af;
  margin-left: 8px;
`

const CommentInputRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 8px;
`

const CommentInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 13px;
  outline: none;
  &:focus { border-color: #facc15; }
`

const CommentSendBtn = styled.button`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 5px;
  border: none;
  background: #facc15;
  color: #1a1a1a;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #eab308; }
`

const NoComments = styled.p`
  font-size: 12px;
  color: #9ca3af;
  margin: 4px 0;
`

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALL_DEPTS = '__all__'

// Assistant messages store the raw model text (chart-config JSON block
// included) so it round-trips into Gemini's chat history — strip it here for
// display only.
function displayContent(content) {
  return content.replace(/```json[\s\S]*?```/g, '').trim()
}

export default function VisualisePage() {
  const [departments, setDepartments] = useState([])
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS)
  const [datasets, setDatasets] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [datasetRows, setDatasetRows] = useState(null)
  const [datasetColumns, setDatasetColumns] = useState(null)
  const [datasetRowCount, setDatasetRowCount] = useState(0)
  const [charts, setCharts] = useState([])
  const [activeChartId, setActiveChartId] = useState(null)
  const [editingTitleId, setEditingTitleId] = useState(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')

  // Reset comment draft when switching to a different chart
  useEffect(() => { setCommentDraft('') }, [activeChartId])
  const chatBottomRef = useRef(null)
  const chartRefs = useRef({})

  const activeChart = charts.find(c => c.id === activeChartId) || null
  const visibleCharts = charts.filter(c => c.datasetId === selectedId)

  // ─── load departments once ────────────────────────────────────────────────

  useEffect(() => {
    apiFetch('/api/departments').then(setDepartments).catch(() => setDepartments([]))
  }, [])

  // ─── load datasets when dept filter changes ───────────────────────────────

  useEffect(() => {
    const url = deptFilter === ALL_DEPTS ? '/api/datasets' : `/api/datasets?department_id=${deptFilter}`
    apiFetch(url).then(setDatasets).catch(() => setDatasets([]))
    setSelectedId('')
    setActiveChartId(null)
    setDatasetRows(null)
    setDatasetColumns(null)
    setDatasetRowCount(0)
    setShowPreview(true)
  }, [deptFilter])

  // ─── scroll chat to bottom on new messages ────────────────────────────────

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChart?.messages])

  // ─── load dataset + saved charts ──────────────────────────────────────────

  async function handleDatasetChange(e) {
    const id = e.target.value
    setSelectedId(id)
    setActiveChartId(null)
    setPrompt('')
    setDatasetRows(null)
    setDatasetColumns(null)
    setDatasetRowCount(0)
    setShowPreview(true)
    setError(null)

    if (!id) return

    try {
      const [d, savedCharts] = await Promise.all([
        apiFetch(`/api/datasets/${id}`),
        apiFetch(`/api/visualisations?dataset_id=${id}`).catch(() => []),
      ])
      setDatasetRows(d.rows)
      setDatasetColumns(d.columns)
      setDatasetRowCount(d.row_count)

      // Merge saved charts with existing in-memory charts (keep unsaved ones).
      // Charts already in state by _id are not duplicated.
      const existingIds = new Set()
      setCharts(prev => {
        // Build set of server IDs already in state
        prev.forEach(c => { if (c._id) existingIds.add(c._id) })
        return prev  // keep all existing charts
      })

      // Add any saved charts from the server that aren't already in state
      const newFromServer = (savedCharts || [])
        .filter(doc => !existingIds.has(doc._id))
        .map(doc => ({
          id: doc._id,
          _id: doc._id,
          datasetId: id,
          title: doc.title || null,
          titleEditedByUser: false,
          messages: [],    // loaded lazily
          config: doc.config || null,
          comments: [],    // loaded lazily
          sending: false,
          saving: false,
          error: null,
          dirty: false,
          loaded: false,   // full details not yet fetched
        }))
      if (newFromServer.length > 0) {
        setCharts(prev => [...prev, ...newFromServer])
      }
    } catch (err) {
      setError(err.message)
    }
  }

  // ─── update a chart by id ─────────────────────────────────────────────────

  const updateChart = useCallback((id, patch) => {
    setCharts(cs => cs.map(c => c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c))
  }, [])

  // ─── lazy-load full details (messages + comments) when chart focused ──────

  const focusChart = useCallback((id) => {
    setActiveChartId(id)
    const chart = charts.find(c => c.id === id)
    if (chart && chart._id && !chart.loaded) {
      apiFetch(`/api/visualisations/${chart._id}`)
        .then(doc => {
          updateChart(id, {
            messages: doc.messages || [],
            comments: doc.comments || [],
            loaded: true,
          })
        })
        .catch(() => {})
    }
    chartRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [charts, updateChart])

  // ─── add a new (unsaved) chart locally ────────────────────────────────────

  function addChart() {
    if (!selectedId) return
    const id = crypto.randomUUID()
    setCharts(cs => [...cs, {
      id,
      _id: null,
      datasetId: selectedId,
      title: null,
      titleEditedByUser: false,
      messages: [],
      config: null,
      comments: [],
      sending: false,
      saving: false,
      error: null,
      dirty: false,
      loaded: true,   // new charts have no server data to load
    }])
    setActiveChartId(id)
    setPrompt('')
  }

  // ─── delete chart (server + local) ────────────────────────────────────────

  async function deleteChart(id) {
    const chart = charts.find(c => c.id === id)
    if (chart?._id) {
      try {
        await apiFetch(`/api/visualisations/${chart._id}`, { method: 'DELETE' })
      } catch { /* best effort */ }
    }
    setCharts(cs => cs.filter(c => c.id !== id))
    setActiveChartId(prev => prev === id ? null : prev)
  }

  // ─── title editing ────────────────────────────────────────────────────────

  function startEditTitle(chart) {
    setEditingTitleId(chart.id)
    setTitleDraft(chart.title || 'Chart')
  }

  function saveTitle(chart) {
    const trimmed = titleDraft.trim()
    updateChart(chart.id, { title: trimmed || null, titleEditedByUser: true, dirty: true })
    setEditingTitleId(null)
  }

  // ─── send message to Gemini ───────────────────────────────────────────────

  async function handleSend() {
    if (!prompt.trim() || !activeChart || activeChart.sending) return
    const chart = activeChart
    const userMsg = { role: 'user', content: prompt.trim() }
    const nextMessages = [...chart.messages, userMsg]
    const promptText = prompt.trim()
    setPrompt('')
    updateChart(chart.id, { messages: nextMessages, sending: true, error: null })
    try {
      const { explanation, config, raw } = await apiFetch('/api/visualise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: chart.datasetId, messages: nextMessages }),
      })
      updateChart(chart.id, c => ({
        // store the raw response (chart-config JSON block included) so it
        // round-trips back into the next request's history — Gemini needs to
        // see its own prior chart config to act on follow-up tweak requests
        messages: [...c.messages, { role: 'assistant', content: raw || explanation }],
        config: config || c.config,
        title: c.titleEditedByUser ? c.title : (config?.title || c.title),
        sending: false,
        dirty: true,     // unsaved changes after AI response
      }))
    } catch (err) {
      updateChart(chart.id, { messages: chart.messages, sending: false, error: err.message })
      setPrompt(promptText)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── save chart (create or update) ────────────────────────────────────────

  async function handleSave(chartId) {
    const chart = charts.find(c => c.id === chartId)
    if (!chart || chart.saving) return

    updateChart(chart.id, { saving: true, error: null })

    try {
      if (chart._id) {
        // Update existing
        const updated = await apiFetch(`/api/visualisations/${chart._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: chart.title,
            config: chart.config,
            messages: chart.messages,
            comments: chart.comments,
          }),
        })
        updateChart(chart.id, {
          saving: false,
          dirty: false,
          _id: updated._id,
          title: updated.title,
          config: updated.config,
          messages: updated.messages || [],
          comments: updated.comments || [],
          loaded: true,
        })
      } else {
        // Create new
        const created = await apiFetch('/api/visualisations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_ids: [chart.datasetId],
            title: chart.title,
            config: chart.config,
            messages: chart.messages,
            comments: chart.comments,
          }),
        })
        const newId = created._id
        // Replace the local chart id with the server _id
        updateChart(chart.id, {
          saving: false,
          dirty: false,
          _id: newId,
          id: newId,          // switch to server id for future lookups
          title: created.title,
          config: created.config,
          messages: created.messages || [],
          comments: created.comments || [],
          loaded: true,
        })
        // Update activeChartId so the chart stays active after the id swap
        setActiveChartId(prev => prev === chart.id ? newId : prev)
      }
    } catch (err) {
      updateChart(chart.id, { saving: false, error: err.message })
    }
  }

  // ─── comments ─────────────────────────────────────────────────────────────

  function handleAddComment(chartId) {
    const text = commentDraft.trim()
    if (!text) return
    setCommentDraft('')

    const now = new Date().toISOString()
    const comment = {
      id: crypto.randomUUID(),
      content: text,
      created_at: now,
    }

    updateChart(chartId, c => {
      const nextComments = [...c.comments, comment]

      // If chart is saved on server, auto-save comment immediately
      if (c._id) {
        apiFetch(`/api/visualisations/${c._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments: nextComments }),
        }).catch(() => {})  // best effort
      }

      return { comments: nextComments, dirty: !c._id }
    })
  }

  function handleCommentKeyDown(e, chartId) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddComment(chartId)
    }
  }

  // ─── derived ──────────────────────────────────────────────────────────────

  const noDatasets = datasets.length === 0
  const hasPreviewData = Boolean(datasetColumns && datasetRows)
  const showPreviewBlock = showPreview && hasPreviewData
  const showEmptyPlaceholder = visibleCharts.length === 0 && !showPreviewBlock

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div>
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

            {hasPreviewData && (
              <ToggleButton type="button" onClick={() => setShowPreview(v => !v)}>
                {showPreview ? 'Hide dataset preview' : 'Show dataset preview'}
              </ToggleButton>
            )}

            {activeChart && activeChart.messages.length > 0 && (
              <ChatLog>
                {activeChart.messages.map((m, i) => (
                  <Bubble key={i} $role={m.role}>{m.role === 'assistant' ? displayContent(m.content) : m.content}</Bubble>
                ))}
                <div ref={chatBottomRef} />
              </ChatLog>
            )}

            {(error || activeChart?.error) && <ErrorMsg>{error || activeChart.error}</ErrorMsg>}
          </PanelBody>

          <Divider />

          <InputArea>
            <Textarea
              placeholder={
                !selectedId
                  ? 'Select a dataset first'
                  : !activeChart
                    ? 'Click "+" to start a new chart'
                    : 'Ask to visualise your data… (Enter to send)'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeChart || activeChart.sending}
            />
            <SendButton onClick={handleSend} disabled={!prompt.trim() || !activeChart || activeChart.sending}>
              {activeChart?.sending ? '…' : 'Send'}
            </SendButton>
          </InputArea>
        </Panel>

        <MiddleColumn>
          {showPreviewBlock && (
            <ChartCard $empty={false}>
              <PreviewHeader>
                <PreviewTitle>Data Preview</PreviewTitle>
                <PreviewMeta>First {Math.min(25, datasetRows.length)} of {datasetRowCount} row{datasetRowCount !== 1 ? 's' : ''} · {datasetColumns.length} column{datasetColumns.length !== 1 ? 's' : ''}</PreviewMeta>
              </PreviewHeader>
              <ColumnTags>
                {datasetColumns.map(col => (
                  <ColumnTag key={col}>{col}</ColumnTag>
                ))}
              </ColumnTags>
              <TableWrap>
                <StyledTable>
                  <thead>
                    <tr>
                      {datasetColumns.map(col => (
                        <Th key={col}>{col}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datasetRows.slice(0, 25).map((row, i) => (
                      <tr key={i}>
                        {datasetColumns.map(col => (
                          <Td key={col} $odd={i % 2 === 1}>{row[col] ?? ''}</Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </StyledTable>
              </TableWrap>
            </ChartCard>
          )}

          {visibleCharts.length > 0 && (
            <ChartsGrid>
              {visibleCharts.map((chart, i) => {
                const isLoneOdd = visibleCharts.length % 2 === 1 && i === visibleCharts.length - 1
                const notSaved = !chart._id
                const isDirty = chart.dirty
                const showSave = notSaved || isDirty
                return (
                  <ChartCard
                    key={chart.id}
                    ref={node => { if (node) chartRefs.current[chart.id] = node }}
                    $empty={!chart.config}
                    $span={isLoneOdd}
                    onClick={() => setActiveChartId(chart.id)}
                  >
                    <ChartCardHeader>
                      {editingTitleId === chart.id
                        ? <TitleInput
                            autoFocus
                            value={titleDraft}
                            onChange={e => setTitleDraft(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveTitle(chart)
                              if (e.key === 'Escape') setEditingTitleId(null)
                            }}
                            onBlur={() => saveTitle(chart)}
                          />
                        : <>
                            <ChartCardTitle>
                              {chart.title || `Chart`}
                              {notSaved && <UnsavedDot title="Not yet saved" />}
                              {isDirty && !notSaved && <UnsavedDot title="Unsaved changes" />}
                            </ChartCardTitle>
                            <HeaderActions>
                              {showSave && (
                                <SaveBtn
                                  $saving={chart.saving}
                                  onClick={e => { e.stopPropagation(); handleSave(chart.id) }}
                                  disabled={chart.saving}
                                >
                                  {chart.saving ? 'Saving…' : notSaved ? 'Save' : 'Update'}
                                </SaveBtn>
                              )}
                              <EditButton
                                type="button"
                                title="Rename chart"
                                onClick={e => { e.stopPropagation(); startEditTitle(chart) }}
                              >
                                ✎
                              </EditButton>
                            </HeaderActions>
                          </>}
                    </ChartCardHeader>

                    {chart.config
                      ? <ChartRenderer config={{ ...chart.config, title: undefined }} rows={datasetRows} />
                      : <Placeholder>{chart.sending ? 'Generating chart…' : 'Ask a question in the chat panel to generate this chart'}</Placeholder>}

                    {/* Comments section — visible when active or when there are comments */}
                    {(chart.id === activeChartId || chart.comments.length > 0) && (
                      <CommentsSection onClick={e => e.stopPropagation()}>
                        <CommentsTitle>Comments ({chart.comments.length})</CommentsTitle>
                        {chart.comments.length === 0 && <NoComments>No comments yet.</NoComments>}
                        {chart.comments.map(cm => (
                          <CommentItem key={cm.id}>
                            <CommentTime>
                              {new Date(cm.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </CommentTime>
                            <CommentText>{cm.content}</CommentText>
                          </CommentItem>
                        ))}
                        <CommentInputRow>
                          <CommentInput
                            placeholder="Add a comment…"
                            value={chart.id === activeChartId ? commentDraft : ''}
                            onChange={e => {
                              if (chart.id === activeChartId) setCommentDraft(e.target.value)
                            }}
                            onKeyDown={e => handleCommentKeyDown(e, chart.id)}
                            disabled={chart.saving}
                          />
                          <CommentSendBtn
                            onClick={() => handleAddComment(chart.id)}
                            disabled={!commentDraft.trim() || chart.saving}
                          >
                            Send
                          </CommentSendBtn>
                        </CommentInputRow>
                      </CommentsSection>
                    )}
                  </ChartCard>
                )
              })}
            </ChartsGrid>
          )}

          {showEmptyPlaceholder && (
            <ChartCard $empty>
              <Placeholder>
                {!selectedId
                  ? 'Select a dataset to get started'
                  : !hasPreviewData
                    ? 'Click "+" to start your first chart'
                    : 'Preview hidden — click "+" to start a chart, or show the preview again'}
              </Placeholder>
            </ChartCard>
          )}
        </MiddleColumn>

        <NavSidebar>
          <NavHeader>
            <NavHeaderTitle>Charts</NavHeaderTitle>
            <AddButton type="button" onClick={addChart} disabled={!selectedId} title="New chart">+</AddButton>
          </NavHeader>
          <NavList>
            {visibleCharts.length === 0
              ? <NavEmpty>No charts yet</NavEmpty>
              : visibleCharts.map(c => (
                  <NavItemRow key={c.id} $active={c.id === activeChartId}>
                    <NavItemButton
                      type="button"
                      $active={c.id === activeChartId}
                      onClick={() => focusChart(c.id)}
                    >
                      {c.title || 'Chart'}
                      {(c.dirty || !c._id) && <UnsavedDot />}
                    </NavItemButton>
                    <NavDeleteButton type="button" title="Delete chart" onClick={() => deleteChart(c.id)}>×</NavDeleteButton>
                  </NavItemRow>
                ))}
          </NavList>
        </NavSidebar>
      </Layout>
    </div>
  )
}
