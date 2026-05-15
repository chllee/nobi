import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const Section = styled.section`
  margin-bottom: 40px;
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
  padding: 24px;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: #374151;
`

const Select = styled.select`
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  min-width: 200px;
`

const FileLabel = styled.label`
  display: inline-block;
  padding: 8px 14px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: #e5e7eb; }
`

const HiddenInput = styled.input`
  display: none;
`

const FileMeta = styled.span`
  font-size: 13px;
  color: #6b7280;
`

const UploadButton = styled.button`
  padding: 8px 18px;
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

const StatusMsg = styled.p`
  margin: 12px 0 0;
  font-size: 14px;
  color: ${p => p.$error ? '#dc2626' : '#16a34a'};
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
  white-space: nowrap;
`

const Td = styled.td`
  padding: 12px 12px;
  border-bottom: 1px solid #f3f4f6;
  color: #111827;
  vertical-align: top;
`

const ColumnList = styled.span`
  color: #6b7280;
  font-size: 13px;
`

const SearchInput = styled.input`
  width: 100%;
  max-width: 320px;
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
  outline: none;
`

const TableWrap = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`

const EmptyMsg = styled.p`
  margin: 0;
  font-size: 14px;
  color: #9ca3af;
`

const DeleteButton = styled.button`
  padding: 4px 10px;
  font-size: 13px;
  color: #dc2626;
  background: none;
  border: 1px solid #fca5a5;
  border-radius: 5px;
  cursor: pointer;
`

const ConfirmRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
`

const ConfirmBtn = styled.button`
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid ${p => p.$danger ? '#fca5a5' : '#d1d5db'};
  background: ${p => p.$danger ? '#fef2f2' : '#f9fafb'};
  color: ${p => p.$danger ? '#dc2626' : '#374151'};
`

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function summariseColumns(columns) {
  if (columns.length <= 4) return columns.join(', ')
  return `${columns.slice(0, 4).join(', ')} +${columns.length - 4} more`
}

const ALL_DEPTS = '__all__'

export default function DatasetsPage() {
  const { user, canInDept } = useAuth()
  const [departments, setDepartments] = useState([])
  const [selectedDept, setSelectedDept] = useState(ALL_DEPTS)
  const [datasets, setDatasets] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const fileInputRef = useRef(null)

  const deptById = Object.fromEntries(departments.map(d => [d.id, d]))
  const uploadDeptId = selectedDept === ALL_DEPTS ? null : selectedDept
  const uploadDept = uploadDeptId ? deptById[uploadDeptId] : null
  const canUploadHere = uploadDept && canInDept('upload', uploadDept)

  async function fetchDepartments() {
    try {
      const d = await apiFetch('/api/departments')
      setDepartments(d)
      if (d.length === 1) setSelectedDept(d[0].id)
    } catch {
      setDepartments([])
    }
  }

  async function fetchDatasets() {
    setLoadingList(true)
    setListError(null)
    try {
      const url = selectedDept === ALL_DEPTS
        ? '/api/datasets'
        : `/api/datasets?department_id=${selectedDept}`
      const data = await apiFetch(url)
      setDatasets(data)
    } catch (e) {
      setListError(e.message)
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { fetchDepartments() }, [])
  useEffect(() => { fetchDatasets() }, [selectedDept])

  function handleFileChange(e) {
    setFile(e.target.files[0] ?? null)
    setUploadStatus(null)
  }

  async function handleDelete(id) {
    await apiFetch(`/api/datasets/${id}`, { method: 'DELETE' })
    setConfirmingDelete(null)
    fetchDatasets()
  }

  async function handleUpload() {
    if (!file || !uploadDeptId) return
    setUploading(true)
    setUploadStatus(null)
    const form = new FormData()
    form.append('file', file)
    form.append('department_id', uploadDeptId)
    try {
      const result = await apiFetch('/api/datasets', { method: 'POST', body: form })
      setUploadStatus({ ok: true, msg: `Uploaded "${result.name}" — ${result.row_count} rows` })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchDatasets()
    } catch (e) {
      setUploadStatus({ ok: false, msg: e.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <Section>
        <Card>
          <Row>
            <Label>Department</Label>
            <Select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              <option value={ALL_DEPTS}>All departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.is_hq ? ' (HQ)' : ''}</option>
              ))}
            </Select>
          </Row>
        </Card>
      </Section>

      {canUploadHere && (
        <Section>
          <SectionTitle>Upload to {uploadDept.name}</SectionTitle>
          <Card>
            <Row>
              <FileLabel htmlFor="csv-upload">Choose file</FileLabel>
              <HiddenInput
                id="csv-upload"
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
              />
              {file
                ? <FileMeta>{file.name} ({formatSize(file.size)})</FileMeta>
                : <FileMeta>CSV only · max 4 MB</FileMeta>}
              <UploadButton onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? 'Uploading…' : 'Upload'}
              </UploadButton>
            </Row>
            {uploadStatus && <StatusMsg $error={!uploadStatus.ok}>{uploadStatus.msg}</StatusMsg>}
          </Card>
        </Section>
      )}

      <Section>
        <SectionTitle>
          {selectedDept === ALL_DEPTS ? 'All datasets' : `Datasets in ${uploadDept?.name || ''}`}
        </SectionTitle>
        <Card>
          {!loadingList && !listError && datasets.length > 0 && (
            <SearchInput
              type="text"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          )}
          {loadingList && <EmptyMsg>Loading…</EmptyMsg>}
          {listError && <EmptyMsg style={{ color: '#dc2626' }}>{listError}</EmptyMsg>}
          {!loadingList && !listError && datasets.length === 0 && (
            <EmptyMsg>
              {selectedDept === ALL_DEPTS
                ? 'No datasets yet.'
                : canUploadHere
                  ? 'No datasets in this department yet. Upload a CSV above.'
                  : 'No datasets in this department yet.'}
            </EmptyMsg>
          )}
          {!loadingList && !listError && datasets.length > 0 && (() => {
            const filtered = datasets.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
            if (filtered.length === 0) return <EmptyMsg>No datasets match your search.</EmptyMsg>
            const showDept = selectedDept === ALL_DEPTS
            return (
              <TableWrap><Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    {showDept && <Th>Department</Th>}
                    <Th>Columns</Th>
                    <Th>Rows</Th>
                    <Th>Uploaded</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const canDelete = canInDept('delete', deptById[d.department_id] ?? d.department_id) || d.uploaded_by === user.id
                    return (
                      <tr key={d.id}>
                        <Td>{d.name}</Td>
                        {showDept && <Td>{deptById[d.department_id]?.name || '—'}</Td>}
                        <Td><ColumnList>{summariseColumns(d.columns)}</ColumnList></Td>
                        <Td>{d.row_count.toLocaleString()}</Td>
                        <Td>{formatDate(d.uploaded_at)}</Td>
                        <Td>
                          {canDelete && (
                            confirmingDelete === d.id
                              ? (
                                <ConfirmRow>
                                  Delete?
                                  <ConfirmBtn $danger onClick={() => handleDelete(d.id)}>Yes</ConfirmBtn>
                                  <ConfirmBtn onClick={() => setConfirmingDelete(null)}>Cancel</ConfirmBtn>
                                </ConfirmRow>
                              )
                              : (
                                <DeleteButton onClick={() => setConfirmingDelete(d.id)}>Delete</DeleteButton>
                              )
                          )}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table></TableWrap>
            )
          })()}
        </Card>
      </Section>
    </div>
  )
}
