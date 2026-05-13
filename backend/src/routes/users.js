import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';

const router = Router();

router.get('/search', requireAuth, requireMembership, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json([]);

  // ILIKE prefix match on email or display_name. Escape any % or _ the user typed.
  const safe = q.replace(/[%_\\]/g, ch => '\\' + ch);
  const pattern = `${safe}%`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .or(`email.ilike.${pattern},display_name.ilike.${pattern}`)
    .neq('id', req.user.id)
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
