import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';

const router = Router();

const VALID_PERMISSIONS = new Set([
  'view', 'upload', 'edit', 'delete', 'manage_members', 'manage_departments',
]);

router.post('/', requireAuth, requireMembership, async (req, res) => {
  const { invitee_user_id, department_id, role = 'viewer', extra_permissions = [] } = req.body || {};
  if (!invitee_user_id || !department_id) {
    return res.status(400).json({ error: 'invitee_user_id and department_id are required' });
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (!Array.isArray(extra_permissions) || extra_permissions.some(p => !VALID_PERMISSIONS.has(p))) {
    return res.status(400).json({ error: 'Invalid extra_permissions' });
  }

  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('id, org_id')
    .eq('id', department_id)
    .single();
  if (deptErr || !dept) return res.status(404).json({ error: 'Department not found' });

  if (!req.can('manage_members', dept)) {
    return res.status(403).json({ error: 'Not authorised to invite to this department' });
  }

  if (invitee_user_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot invite yourself' });
  }

  // Block if already a member of this dept, or a member of a *different* org
  // (1 user : 1 org invariant — user must accept across orgs by leaving first).
  const { data: existingInOrg } = await supabase
    .from('memberships')
    .select('id, department:departments(id, org_id)')
    .eq('user_id', invitee_user_id);
  if (existingInOrg?.some(m => m.department.id === dept.id)) {
    return res.status(409).json({ error: 'User is already a member of this department' });
  }
  if (existingInOrg?.some(m => m.department.org_id !== dept.org_id)) {
    return res.status(409).json({ error: 'User already belongs to a different organisation' });
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      department_id: dept.id,
      invitee_user_id,
      role,
      extra_permissions,
      invited_by: req.user.id,
      status: 'pending',
    })
    .select('id, department_id, invitee_user_id, role, extra_permissions, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A pending invitation already exists for this user and department' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// Pending invitations addressed to the current user.
router.get('/incoming', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, role, extra_permissions, status, created_at, invited_by, department_id, department:departments(id, name, is_hq, org_id, organisation:organisations(id, name))')
    .eq('invitee_user_id', req.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const inviterIds = [...new Set((data || []).map(i => i.invited_by).filter(Boolean))];
  let inviterMap = {};
  if (inviterIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', inviterIds);
    inviterMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  }

  res.json((data || []).map(i => ({ ...i, inviter: inviterMap[i.invited_by] || null })));
});

// Invitations outstanding for a specific department (admin view).
router.get('/department/:id', requireAuth, requireMembership, async (req, res) => {
  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('id, org_id')
    .eq('id', req.params.id)
    .single();
  if (deptErr || !dept) return res.status(404).json({ error: 'Department not found' });

  if (!req.can('manage_members', dept)) {
    return res.status(403).json({ error: 'Not authorised to view invitations for this department' });
  }

  const { data, error } = await supabase
    .from('invitations')
    .select('id, role, extra_permissions, status, created_at, invitee_user_id')
    .eq('department_id', dept.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const inviteeIds = [...new Set((data || []).map(i => i.invitee_user_id).filter(Boolean))];
  let inviteeMap = {};
  if (inviteeIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', inviteeIds);
    inviteeMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  }

  res.json((data || []).map(i => ({ ...i, invitee: inviteeMap[i.invitee_user_id] || null })));
});

router.post('/:id/accept', requireAuth, async (req, res) => {
  const { data: invite, error: fetchErr } = await supabase
    .from('invitations')
    .select('id, department_id, invitee_user_id, role, extra_permissions, status, department:departments(id, org_id)')
    .eq('id', req.params.id)
    .single();
  if (fetchErr || !invite) return res.status(404).json({ error: 'Invitation not found' });

  if (invite.invitee_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your invitation' });
  }
  if (invite.status !== 'pending') {
    return res.status(409).json({ error: `Invitation is already ${invite.status}` });
  }

  // Enforce 1 user : 1 org at accept time too — guards against the case where
  // the user gained a different-org membership after the invite was created.
  if (req.memberships.some(m => m.department.org_id !== invite.department.org_id)) {
    return res.status(409).json({ error: 'You already belong to a different organisation' });
  }

  const { error: insertErr } = await supabase.from('memberships').insert({
    user_id: req.user.id,
    department_id: invite.department_id,
    role: invite.role,
    extra_permissions: invite.extra_permissions,
  });
  if (insertErr) {
    if (insertErr.code === '23505') {
      // Already a member somehow — mark invite as accepted anyway.
      await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id);
      return res.status(409).json({ error: 'Already a member of this department' });
    }
    return res.status(500).json({ error: insertErr.message });
  }

  await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id);
  res.json({ ok: true });
});

router.post('/:id/reject', requireAuth, async (req, res) => {
  const { data: invite, error: fetchErr } = await supabase
    .from('invitations')
    .select('id, invitee_user_id, status')
    .eq('id', req.params.id)
    .single();
  if (fetchErr || !invite) return res.status(404).json({ error: 'Invitation not found' });

  if (invite.invitee_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your invitation' });
  }
  if (invite.status !== 'pending') {
    return res.status(409).json({ error: `Invitation is already ${invite.status}` });
  }

  await supabase.from('invitations').update({ status: 'rejected' }).eq('id', invite.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireMembership, async (req, res) => {
  const { data: invite, error: fetchErr } = await supabase
    .from('invitations')
    .select('id, invited_by, status, department:departments(id, org_id)')
    .eq('id', req.params.id)
    .single();
  if (fetchErr || !invite) return res.status(404).json({ error: 'Invitation not found' });

  if (invite.status !== 'pending') {
    return res.status(409).json({ error: `Invitation is already ${invite.status}` });
  }

  const isInviter = invite.invited_by === req.user.id;
  const canManage = req.can('manage_members', invite.department);
  if (!isInviter && !canManage) {
    return res.status(403).json({ error: 'Not authorised to revoke this invitation' });
  }

  await supabase.from('invitations').update({ status: 'revoked' }).eq('id', invite.id);
  res.status(204).end();
});

export default router;
