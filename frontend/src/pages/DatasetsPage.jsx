import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const PageTitle = styled.h2`
  margin: 0 0 24px;
  font-size: 20px;
  font-weight: 600;
`

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

const FileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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

  &:hover {
    background: #e5e7eb;
  }
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
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: #333;
  }
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

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
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
  white-space: nowrap;

  &:hover {
    background: #fef2f2;
  }
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

  &:hover {
    background: ${p => p.$danger ? '#fee2e2' : '#f3f4f6'};
  }
`

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function summariseColumns(columns) {
  if (columns.length <= 4) return columns.join(', ')
  return `${columns.slice(0, 4).join(', ')} +${columns.length - 4} more`
}

export default function DatasetsPage() {
  const { role } = useAuth()
  const canUpload = role === 'admin' || role === 'editor'
  const [datasets, setDatasets] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(null)

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null) // { ok: bool, msg: string }
  const fileInputRef = useRef(null)

  async function fetchDatasets() {
    setLoadingList(true)
    setListError(null)
    try {
      const data = await apiFetch('/api/datasets')
      setDatasets(data)
    } catch (e) {
      setListError(e.message)
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { fetchDatasets() }, [])

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
    if (!file) return
    setUploading(true)
    setUploadStatus(null)
    const form = new FormData()
    form.append('file', file)
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
      <PageTitle>Datasets</PageTitle>

      {canUpload && <Section>
        <SectionTitle>Upload a dataset</SectionTitle>
        <Card>
          <FileRow>
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
              : <FileMeta>CSV only · max 4 MB</FileMeta>
            }
            <UploadButton onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </UploadButton>
          </FileRow>
          {uploadStatus && (
            <StatusMsg $error={!uploadStatus.ok}>{uploadStatus.msg}</StatusMsg>
          )}
        </Card>
      </Section>}

      <Section>
        <SectionTitle>Your datasets</SectionTitle>
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
            <EmptyMsg>No datasets yet. Upload a CSV above to get started.</EmptyMsg>
          )}
          {!loadingList && !listError && datasets.length > 0 && (() => {
            const filtered = datasets.filter(d =>
              d.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            return filtered.length === 0
              ? <EmptyMsg>No datasets match your search.</EmptyMsg>
              : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Columns</Th>
                      <Th>Rows</Th>
                      <Th>Uploaded</Th>
                      {canUpload && <Th></Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id}>
                        <Td>{d.name}</Td>
                        <Td><ColumnList>{summariseColumns(d.columns)}</ColumnList></Td>
                        <Td>{d.row_count.toLocaleString()}</Td>
                        <Td>{formatDate(d.uploaded_at)}</Td>
                        {canUpload && <Td>
                          {confirmingDelete === d.id
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
                          }
                        </Td>}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )
          })()}
        </Card>
      </Section>
    </div>
  )
}
