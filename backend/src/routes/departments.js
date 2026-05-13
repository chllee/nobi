import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

// GET /api/departments?org_id=...
// HQ members see every dept in the org; non-HQ members see only their own depts.
// If no org_id is given, returns depts across every org the caller belongs to.
router.get('/', requireAuth, requireMembership, async (req, res) => {
  const orgFilter = req.query.org_id;
  const orgIds = orgFilter ? [orgFilter] : req.orgIds;

  if (orgFilter && !req.orgIds.includes(orgFilter)) {
    return res.status(403).json({ error: 'Not a member of this organisation' });
  }

  const hqOrgs = new Set(
    req.memberships.filter(m => m.department.is_hq).map(m => m.department.org_id)
  );

  const ownDeptIds = new Set(req.memberships.map(m => m.department.id));

  const { data: rows, error } = await supabase
    .from('departments')
    .select('id, org_id, name, is_hq, created_at')
    .in('org_id', orgIds);

  if (error) return res.status(500).json({ error: error.message });

  const visible = rows.filter(d => hqOrgs.has(d.org_id) || ownDeptIds.has(d.id));
  res.json(visible);
});

router.post('/', requireAuth, requireMembership, async (req, res) => {
  const { org_id, name } = req.body || {};
  if (!org_id || !name || !name.trim()) {
    return res.status(400).json({ error: 'org_id and name are required' });
  }
  if (!req.canInOrg('manage_departments', org_id)) {
    return res.status(403).json({ error: 'Only HQ admins can create departments' });
  }
  if (name.trim().toLowerCase() === 'hq') {
    return res.status(400).json({ error: 'HQ is reserved' });
  }

  const { data, error } = await supabase
    .from('departments')
    .insert({ org_id, name: name.trim(), is_hq: false })
    .select('id, org_id, name, is_hq, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

router.patch('/:id', requireAuth, requireMembership, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const { data: dept, error: fetchError } = await supabase
    .from('departments')
    .select('id, org_id, is_hq')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !dept) return res.status(404).json({ error: 'Department not found' });

  if (dept.is_hq) return res.status(400).json({ error: 'HQ cannot be renamed' });
  if (!req.canInOrg('manage_departments', dept.org_id)) {
    return res.status(403).json({ error: 'Only HQ admins can rename departments' });
  }

  const { data, error } = await supabase
    .from('departments')
    .update({ name: name.trim() })
    .eq('id', dept.id)
    .select('id, org_id, name, is_hq, created_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// List members of a department. Caller must be in the dept or an HQ member of the org.
router.get('/:id/members', requireAuth, requireMembership, async (req, res) => {
  const { data: dept, error: fetchError } = await supabase
    .from('departments')
    .select('id, org_id')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !dept) return res.status(404).json({ error: 'Department not found' });

  const hqMember = req.memberships.some(m => m.department.is_hq && m.department.org_id === dept.org_id);
  const deptMember = req.memberships.some(m => m.department.id === dept.id);
  if (!hqMember && !deptMember) {
    return res.status(403).json({ error: 'Not authorised to view this department' });
  }

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('id, user_id, role, extra_permissions, created_at')
    .eq('department_id', dept.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const userIds = [...new Set((rows || []).map(m => m.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', userIds);
    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  }

  res.json((rows || []).map(m => ({ ...m, profile: profileMap[m.user_id] || null })));
});

router.delete('/:id', requireAuth, requireMembership, async (req, res) => {
  const { data: dept, error: fetchError } = await supabase
    .from('departments')
    .select('id, org_id, is_hq')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !dept) return res.status(404).json({ error: 'Department not found' });

  if (dept.is_hq) return res.status(400).json({ error: 'HQ cannot be deleted' });
  if (!req.canInOrg('manage_departments', dept.org_id)) {
    return res.status(403).json({ error: 'Only HQ admins can delete departments' });
  }

  // Block deletion if any live datasets still live in the dept — keeps Mongo from
  // accumulating orphans without a migration step.
  const db = getDb();
  const datasetCount = await db.collection('datasets').countDocuments({
    department_id: dept.id,
    deleted_at: { $exists: false },
  });
  if (datasetCount > 0) {
    return res.status(409).json({
      error: `Department still has ${datasetCount} dataset(s). Move or delete them first.`,
    });
  }

  const { error } = await supabase.from('departments').delete().eq('id', dept.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
