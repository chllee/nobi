import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const { data: orgId, error } = await supabase.rpc('create_org', {
    p_name: name.trim(),
    p_user: req.user.id,
  });
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ id: orgId, name: name.trim(), created_at: new Date().toISOString() });
});

// Summary of every org the caller belongs to: org info + the caller's memberships within it.
router.get('/me', requireAuth, async (req, res) => {
  if (req.memberships.length === 0) {
    return res.json({ organisations: [] });
  }

  const orgIds = [...new Set(req.memberships.map(m => m.department.org_id))];
  const { data: orgs, error } = await supabase
    .from('organisations')
    .select('id, name, created_at')
    .in('id', orgIds);

  if (error) return res.status(500).json({ error: error.message });

  const byOrg = orgs.map(o => ({
    ...o,
    memberships: req.memberships
      .filter(m => m.department.org_id === o.id)
      .map(m => ({
        id: m.id,
        role: m.role,
        extra_permissions: m.extra_permissions,
        department: m.department,
      })),
  }));

  res.json({ organisations: byOrg });
});

export default router;
