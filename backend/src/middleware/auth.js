import supabase from '../lib/supabase.js';

const ROLE_DEFAULTS = {
  admin: ['view', 'upload', 'edit', 'delete', 'manage_members', 'manage_departments'],
  editor: ['view', 'upload', 'edit'],
  viewer: ['view'],
};

function permissionsFor(role, extra) {
  return new Set([...(ROLE_DEFAULTS[role] || []), ...(extra || [])]);
}

// Mirrors the SQL user_can() helper. HQ membership in the same org grants the
// role's permissions across every dept; otherwise the direct dept membership decides.
function makeCan(memberships) {
  // `dept` may be either a dept id string or { id, org_id }. The org-aware form
  // is preferred because HQ-override needs to know the org.
  const can = (action, dept) => {
    if (!dept) return false;
    const deptId = typeof dept === 'string' ? dept : dept.id;
    const orgId  = typeof dept === 'string' ? null  : dept.org_id;

    const direct = memberships.find(m => m.department.id === deptId);
    const inferredOrgId = orgId ?? direct?.department.org_id ?? null;

    if (inferredOrgId) {
      const hq = memberships.find(m => m.department.is_hq && m.department.org_id === inferredOrgId);
      if (hq && permissionsFor(hq.role, hq.extra_permissions).has(action)) return true;
    }
    if (direct && permissionsFor(direct.role, direct.extra_permissions).has(action)) return true;
    return false;
  };

  // For "create department", "rename org" — actions scoped to an org, not a dept.
  const canInOrg = (action, orgId) => {
    if (!orgId) return false;
    const hq = memberships.find(m => m.department.is_hq && m.department.org_id === orgId);
    return !!hq && permissionsFor(hq.role, hq.extra_permissions).has(action);
  };

  return { can, canInOrg };
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const [{ data: rows, error: memberError }, { data: profile }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, role, extra_permissions, department:departments(id, org_id, name, is_hq)')
      .eq('user_id', user.id),
    supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single(),
  ]);

  if (memberError) {
    console.error('requireAuth: failed to load memberships', memberError);
    return res.status(500).json({ error: 'Failed to load memberships' });
  }

  req.user = user;
  req.memberships = rows || [];
  req.isPlatformAdmin = profile?.is_platform_admin ?? false;
  const helpers = makeCan(req.memberships);
  req.can = helpers.can;
  req.canInOrg = helpers.canInOrg;
  req.orgIds = [...new Set(req.memberships.map(m => m.department.org_id))];
  next();
}

// Use on routes that require the caller to be in at least one org.
export function requireMembership(req, res, next) {
  if (!req.memberships || req.memberships.length === 0) {
    return res.status(403).json({ error: 'No organisation membership' });
  }
  next();
}

// Use on routes that require platform-level admin access.
export function requirePlatformAdmin(req, res, next) {
  if (!req.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

export { permissionsFor, ROLE_DEFAULTS };
