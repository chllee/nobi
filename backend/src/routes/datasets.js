import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { ObjectId } from 'mongodb';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

// UPLOAD_LIMIT: 4MB multer cap. CSV→JSON expansion (2–5×) can approach MongoDB's
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

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true });
  } catch {
    return res.status(400).json({ error: 'Failed to parse CSV' });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'CSV has no data rows' });
  }

  const serialised = JSON.stringify(rows);
  // 14MB guard — keeps the full document safely under MongoDB's 16MB limit
  if (Buffer.byteLength(serialised) > 14 * 1024 * 1024) {
    return res.status(413).json({ error: 'Parsed data exceeds storage limit. Use a smaller file.' });
  }

  const doc = {
    org_id: req.orgId,
    name: req.file.originalname.replace(/\.csv$/i, ''),
    uploaded_by: req.user.id,
    uploaded_at: new Date(),
    columns: Object.keys(rows[0]),
    rows,
    row_count: rows.length,
  };

  const db = getDb();
  const result = await db.collection('datasets').insertOne(doc);

  res.status(201).json({ id: result.insertedId, name: doc.name, row_count: doc.row_count });
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const datasets = await db
    .collection('datasets')
    .find({ org_id: req.orgId, deleted_at: { $exists: false } }, { projection: { rows: 0 } })
    .sort({ uploaded_at: -1 })
    .toArray();

  res.json(datasets.map(d => ({
    id: d._id,
    name: d.name,
    columns: d.columns,
    row_count: d.row_count,
    uploaded_by: d.uploaded_by,
    uploaded_at: d.uploaded_at,
  })));
});

router.get('/:id', requireAuth, async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid dataset ID' });
  }

  const db = getDb();
  const dataset = await db.collection('datasets').findOne(
    { _id: oid, org_id: req.orgId, deleted_at: { $exists: false } }
  );
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

  // Cap at 1000 rows for chart rendering — full dataset lives in MongoDB
  res.json({
    id: dataset._id,
    name: dataset.name,
    columns: dataset.columns,
    rows: dataset.rows.slice(0, 1000),
    row_count: dataset.row_count,
    uploaded_at: dataset.uploaded_at,
  });
});

router.delete('/:id', requireAuth, async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid dataset ID' });
  }

  const db = getDb();
  const dataset = await db.collection('datasets').findOne({ _id: oid, org_id: req.orgId });
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

  if (dataset.uploaded_by !== req.user.id && req.role !== 'admin') {
    return res.status(403).json({ error: 'Only the uploader or an org admin can delete this dataset' });
  }

  await db.collection('datasets').updateOne({ _id: oid }, { $set: { deleted_at: new Date() } });
  res.status(204).end();
});

export default router;
