import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';

const router = Router();

const VALID_PERMISSIONS = new Set([
  'view', 'upload', 'edit', 'delete', 'manage_members', 'manage_departments',
]);

async function loadMembership(id) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, user_id, role, extra_permissions, department:departments(id, org_id, is_hq)')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

// Prevents removing/demoting the last admin of an org's HQ — would orphan the org.
async function wouldOrphanHQ(member, nextRole) {
  if (!member.department.is_hq) return false;
  if (member.role !== 'admin') return false;
  if (nextRole === 'admin') return false;

  const { count } = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', member.department.id)
    .eq('role', 'admin');
  return (count || 0) <= 1;
}

router.patch('/:id', requireAuth, requireMembership, async (req, res) => {
  const { role, extra_permissions } = req.body || {};
  const member = await loadMembership(req.params.id);
  if (!member) return res.status(404).json({ error: 'Membership not found' });

  if (!req.can('manage_members', { id: member.department.id, org_id: member.department.org_id })) {
    return res.status(403).json({ error: 'Not authorised to manage members in this department' });
  }

  if (role !== undefined && !['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (extra_permissions !== undefined) {
    if (!Array.isArray(extra_permissions) || extra_permissions.some(p => !VALID_PERMISSIONS.has(p))) {
      return res.status(400).json({ error: 'Invalid extra_permissions' });
    }
  }

  if (await wouldOrphanHQ(member, role ?? member.role)) {
    return res.status(409).json({ error: 'Cannot demote the last HQ admin' });
  }

  const patch = {};
  if (role !== undefined) patch.role = role;
  if (extra_permissions !== undefined) patch.extra_permissions = extra_permissions;

  const { data, error } = await supabase
    .from('memberships')
    .update(patch)
    .eq('id', member.id)
    .select('id, role, extra_permissions, department:departments(id, org_id, name, is_hq)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAuth, requireMembership, async (req, res) => {
  const member = await loadMembership(req.params.id);
  if (!member) return res.status(404).json({ error: 'Membership not found' });

  const isSelf = member.user_id === req.user.id;
  const canManage = req.can('manage_members', { id: member.department.id, org_id: member.department.org_id });
  if (!isSelf && !canManage) {
    return res.status(403).json({ error: 'Not authorised to remove this member' });
  }

  if (await wouldOrphanHQ(member, null)) {
    return res.status(409).json({ error: 'Cannot remove the last HQ admin' });
  }

  const { error } = await supabase.from('memberships').delete().eq('id', member.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
