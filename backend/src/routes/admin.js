import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { getDb, requireMongo } from '../lib/mongo.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

// Overview stats
router.get('/overview', requireMongo, async (_req, res) => {
  const [{ count: orgCount }, { count: userCount }] = await Promise.all([
    supabase.from('organisations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ]);

  const db = getDb();
  const datasetCount = await db.collection('datasets')
    .countDocuments({ deleted_at: { $exists: false } });

  res.json({ organisations: orgCount ?? 0, users: userCount ?? 0, datasets: datasetCount });
});

// All organisations with member and department counts
router.get('/organisations', async (_req, res) => {
  const { data: orgs, error } = await supabase
    .from('organisations')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const orgIds = orgs.map(o => o.id);

  const [{ data: depts }, { data: memberships }] = await Promise.all([
    supabase.from('departments').select('id, org_id').in('org_id', orgIds),
    supabase.from('memberships').select('id, department:departments(org_id)').in('department.org_id', orgIds),
  ]);

  const deptsByOrg = {};
  const membersByOrg = {};
  (depts || []).forEach(d => {
    deptsByOrg[d.org_id] = (deptsByOrg[d.org_id] || 0) + 1;
  });
  (memberships || []).forEach(m => {
    if (m.department?.org_id) {
      membersByOrg[m.department.org_id] = (membersByOrg[m.department.org_id] || 0) + 1;
    }
  });

  res.json(orgs.map(o => ({
    ...o,
    department_count: deptsByOrg[o.id] ?? 0,
    member_count: membersByOrg[o.id] ?? 0,
  })));
});

// All users with their org affiliations
router.get('/users', async (_req, res) => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, is_platform_admin, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const userIds = profiles.map(p => p.id);
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, role, department:departments(id, name, is_hq, org_id, organisation:organisations(id, name))')
    .in('user_id', userIds);

  const membershipsByUser = {};
  (memberships || []).forEach(m => {
    if (!membershipsByUser[m.user_id]) membershipsByUser[m.user_id] = [];
    membershipsByUser[m.user_id].push(m);
  });

  res.json(profiles.map(p => ({
    ...p,
    memberships: membershipsByUser[p.id] ?? [],
  })));
});

// Toggle platform admin flag
router.patch('/users/:id/admin', async (req, res) => {
  const { is_platform_admin } = req.body;
  if (typeof is_platform_admin !== 'boolean') {
    return res.status(400).json({ error: 'is_platform_admin must be a boolean' });
  }
  const { error } = await supabase
    .from('profiles')
    .update({ is_platform_admin })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Delete an organisation and all its data
router.delete('/organisations/:id', requireMongo, async (req, res) => {
  const orgId = req.params.id;

  // Get all department IDs for this org so we can wipe MongoDB datasets
  const { data: depts } = await supabase
    .from('departments')
    .select('id')
    .eq('org_id', orgId);
  const deptIds = (depts || []).map(d => d.id);

  if (deptIds.length > 0) {
    const db = getDb();
    await db.collection('datasets').deleteMany({ department_id: { $in: deptIds } });
  }

  // Cascade in Postgres handles departments, memberships, invitations
  const { error } = await supabase.from('organisations').delete().eq('id', orgId);
  if (error) return res.status(500).json({ error: error.message });

  res.status(204).end();
});

export default router;
