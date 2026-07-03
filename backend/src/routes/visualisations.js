import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

// All routes require auth + org membership
router.use(requireAuth, requireMembership);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function lookupDataset(datasetId) {
  let oid;
  try { oid = new ObjectId(datasetId); } catch { return null; }
  const db = getDb();
  return db.collection('datasets').findOne(
    { _id: oid, deleted_at: { $exists: false } },
    { projection: { _id: 1, org_id: 1, department_id: 1, name: 1 } }
  );
}

// ─── CREATE ────────────────────────────────────────────────────────────────────
// Called when user clicks "Save" on a chart that has never been saved.
// At minimum: dataset_ids must be provided. title, config, messages, comments optional.
router.post('/', async (req, res) => {
  const { dataset_ids, title, config, messages, comments } = req.body || {};

  if (!Array.isArray(dataset_ids) || dataset_ids.length === 0) {
    return res.status(400).json({ error: 'dataset_ids array is required' });
  }

  // Derive org_id + department_id from the first dataset
  const dataset = await lookupDataset(dataset_ids[0]);
  if (!dataset) {
    return res.status(404).json({ error: 'Dataset not found' });
  }

  if (!req.can('view', { id: dataset.department_id, org_id: dataset.org_id })) {
    return res.status(403).json({ error: 'Not authorised to save visualisations on this dataset' });
  }

  const doc = {
    org_id: dataset.org_id,
    department_id: dataset.department_id,
    dataset_ids: dataset_ids.map(id => {
      try { return new ObjectId(id); } catch { return id; }
    }),
    created_by: req.user.id,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    title: title || null,
    config: config || null,
    messages: messages || [],
    comments: comments || [],
  };

  const db = getDb();
  const result = await db.collection('visualisations').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// ─── LIST (caller's saved charts, no messages/comments, for a dataset) ────────
router.get('/', async (req, res) => {
  const datasetId = req.query.dataset_id;
  if (!datasetId) {
    return res.status(400).json({ error: 'dataset_id query parameter is required' });
  }

  const db = getDb();
  const docs = await db.collection('visualisations')
    .find({
      dataset_ids: { $in: [new ObjectId(datasetId)] },
      created_by: req.user.id,
      deleted_at: null,
    })
    .project({ messages: 0, comments: 0 })
    .sort({ updated_at: -1 })
    .toArray();

  res.json(docs.map(d => ({
    _id: d._id,
    org_id: d.org_id,
    department_id: d.department_id,
    dataset_ids: d.dataset_ids,
    created_by: d.created_by,
    created_at: d.created_at,
    updated_at: d.updated_at,
    title: d.title,
    config: d.config,
  })));
});

// ─── GET SINGLE (with messages + comments) ────────────────────────────────────
router.get('/:id', async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid visualisation ID' }); }

  const db = getDb();
  const doc = await db.collection('visualisations').findOne({ _id: oid, deleted_at: null });
  if (!doc) return res.status(404).json({ error: 'Visualisation not found' });

  if (doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Not your visualisation' });
  }

  res.json(doc);
});

// ─── UPDATE ────────────────────────────────────────────────────────────────────
// Only creator can update. Merges provided fields into the document.
router.patch('/:id', async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid visualisation ID' }); }

  const db = getDb();
  const existing = await db.collection('visualisations').findOne({ _id: oid, deleted_at: null });
  if (!existing) return res.status(404).json({ error: 'Visualisation not found' });

  if (existing.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Not your visualisation' });
  }

  const { title, config, messages, comments } = req.body || {};
  const setFields = { updated_at: new Date() };

  if (title !== undefined) setFields.title = title;
  if (config !== undefined) setFields.config = config;
  if (messages !== undefined) setFields.messages = messages;
  if (comments !== undefined) setFields.comments = comments;

  await db.collection('visualisations').updateOne(
    { _id: oid },
    { $set: setFields }
  );

  const updated = await db.collection('visualisations').findOne({ _id: oid });
  res.json(updated);
});

// ─── SOFT-DELETE ───────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid visualisation ID' }); }

  const db = getDb();
  const existing = await db.collection('visualisations').findOne({ _id: oid, deleted_at: null });
  if (!existing) return res.status(404).json({ error: 'Visualisation not found' });

  if (existing.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Not your visualisation' });
  }

  await db.collection('visualisations').updateOne(
    { _id: oid },
    { $set: { deleted_at: new Date() } }
  );
  res.status(204).end();
});

export default router;
