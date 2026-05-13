import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { ObjectId } from 'mongodb';
import supabase from '../lib/supabase.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

// 4MB multer cap. CSV→JSON expansion (2–5×) can approach MongoDB's
// 16MB document limit on larger files. Revisit with chunked storage if needed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

async function fetchDept(deptId) {
  const { data, error } = await supabase
    .from('departments')
    .select('id, org_id, name, is_hq')
    .eq('id', deptId)
    .single();
  if (error || !data) return null;
  return data;
}

router.post('/', requireAuth, requireMembership, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const departmentId = req.body.department_id;
  if (!departmentId) return res.status(400).json({ error: 'department_id is required' });

  const dept = await fetchDept(departmentId);
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  if (!req.can('upload', dept)) {
    return res.status(403).json({ error: 'Not authorised to upload to this department' });
  }

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true });
  } catch {
    return res.status(400).json({ error: 'Failed to parse CSV' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'CSV has no data rows' });

  const serialised = JSON.stringify(rows);
  if (Buffer.byteLength(serialised) > 14 * 1024 * 1024) {
    return res.status(413).json({ error: 'Parsed data exceeds storage limit. Use a smaller file.' });
  }

  const doc = {
    org_id: dept.org_id,
    department_id: dept.id,
    name: req.file.originalname.replace(/\.csv$/i, ''),
    uploaded_by: req.user.id,
    uploaded_at: new Date(),
    columns: Object.keys(rows[0]),
    rows,
    row_count: rows.length,
  };

  const db = getDb();
  const result = await db.collection('datasets').insertOne(doc);
  res.status(201).json({
    id: result.insertedId,
    department_id: dept.id,
    name: doc.name,
    row_count: doc.row_count,
  });
});

router.get('/', requireAuth, requireMembership, async (req, res) => {
  const hqOrgIds = req.memberships.filter(m => m.department.is_hq).map(m => m.department.org_id);
  const ownDeptIds = req.memberships.map(m => m.department.id);

  const filter = { deleted_at: { $exists: false } };
  if (req.query.department_id) {
    const dept = await fetchDept(req.query.department_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    if (!req.can('view', dept)) {
      return res.status(403).json({ error: 'Not authorised to view this department' });
    }
    filter.department_id = dept.id;
  } else {
    filter.$or = [
      { org_id: { $in: hqOrgIds } },
      { department_id: { $in: ownDeptIds } },
    ];
  }

  const db = getDb();
  const datasets = await db
    .collection('datasets')
    .find(filter, { projection: { rows: 0 } })
    .sort({ uploaded_at: -1 })
    .toArray();

  res.json(datasets.map(d => ({
    id: d._id,
    name: d.name,
    org_id: d.org_id,
    department_id: d.department_id,
    columns: d.columns,
    row_count: d.row_count,
    uploaded_by: d.uploaded_by,
    uploaded_at: d.uploaded_at,
  })));
});

router.get('/:id', requireAuth, requireMembership, async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid dataset ID' }); }

  const db = getDb();
  const dataset = await db.collection('datasets').findOne(
    { _id: oid, deleted_at: { $exists: false } }
  );
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

  if (!req.can('view', { id: dataset.department_id, org_id: dataset.org_id })) {
    return res.status(403).json({ error: 'Not authorised to view this dataset' });
  }

  res.json({
    id: dataset._id,
    name: dataset.name,
    department_id: dataset.department_id,
    columns: dataset.columns,
    rows: dataset.rows.slice(0, 1000),
    row_count: dataset.row_count,
    uploaded_at: dataset.uploaded_at,
  });
});

router.delete('/:id', requireAuth, requireMembership, async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid dataset ID' }); }

  const db = getDb();
  const dataset = await db.collection('datasets').findOne({ _id: oid });
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

  const isUploader = dataset.uploaded_by === req.user.id;
  const canDelete = req.can('delete', { id: dataset.department_id, org_id: dataset.org_id });
  if (!isUploader && !canDelete) {
    return res.status(403).json({ error: 'Not authorised to delete this dataset' });
  }

  await db.collection('datasets').updateOne({ _id: oid }, { $set: { deleted_at: new Date() } });
  res.status(204).end();
});

export default router;
