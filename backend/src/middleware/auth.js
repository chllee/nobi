import supabase from '../lib/supabase.js';

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

  // TODO (future): replace this DB lookup with custom JWT claims for production
  const { data: membership, error: memberError } = await supabase
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single();

  if (memberError || !membership) {
    return res.status(403).json({ error: 'No org membership found' });
  }

  req.user = user;
  req.orgId = membership.org_id;
  req.role = membership.role;
  next();
}
