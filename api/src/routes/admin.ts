import { Hono } from 'hono';
import { rebuildAnonymizedHeatmap } from '../lib/activityPipeline.js';
import { requireAdmin } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import type { AppVariables, Env } from '../types.js';

export const adminRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminRouter.use('*', requireAdmin);

adminRouter.get('/stats', async (c) => {
  const [counts, openReports] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT
         (SELECT COUNT(*)::int FROM users) AS total_users,
         (SELECT COUNT(*)::int FROM activities) AS total_activities,
         (SELECT COUNT(*)::int FROM segments) AS total_segments,
         (SELECT COUNT(*)::int FROM clubs) AS total_clubs,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'open') AS open_reports`
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT r.*, u.handle AS reporter_handle
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
       LIMIT 50`
    ),
  ]);

  return c.json({ stats: counts[0], reports: openReports });
});

adminRouter.post('/reports/:id/resolve', async (c) => {
  const admin = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    status?: 'resolved' | 'dismissed';
    note?: string;
    hideTarget?: boolean;
  };

  const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
  const rows = await queryRows<{ target_type: string; target_id: string }>(
    c.env.DATABASE_URL,
    `UPDATE reports SET status = $2, resolved_by = $3, resolution_note = $4, resolved_at = now()
     WHERE id = $1 RETURNING target_type, target_id`,
    [id, status, admin.id, body.note || '']
  );

  if (body.hideTarget && rows[0]) {
    const { target_type, target_id } = rows[0];
    if (target_type === 'activity') {
      await queryRows(c.env.DATABASE_URL, `UPDATE activities SET is_hidden_by_admin = true WHERE id = $1`, [target_id]);
    } else if (target_type === 'comment') {
      await queryRows(c.env.DATABASE_URL, `UPDATE comments SET is_hidden_by_admin = true WHERE id = $1`, [target_id]);
    } else if (target_type === 'segment') {
      await queryRows(c.env.DATABASE_URL, `UPDATE segments SET is_hidden_by_admin = true WHERE id = $1`, [target_id]);
    } else if (target_type === 'effort') {
      await queryRows(c.env.DATABASE_URL, `UPDATE segment_efforts SET is_hidden_by_admin = true WHERE id = $1`, [target_id]);
    } else if (target_type === 'user') {
      await queryRows(c.env.DATABASE_URL, `UPDATE users SET is_suspended = true WHERE id = $1`, [target_id]);
    }
  }

  return c.json({ ok: true });
});

adminRouter.post('/hide', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    targetType?: 'activity' | 'comment' | 'segment' | 'effort' | 'user';
    targetId?: string;
    hidden?: boolean;
  } | null;

  if (!body?.targetType || !body?.targetId) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'targetType and targetId required' } }, 400);
  }
  const hidden = body.hidden !== false;

  if (body.targetType === 'activity') {
    await queryRows(c.env.DATABASE_URL, `UPDATE activities SET is_hidden_by_admin = $2 WHERE id = $1`, [body.targetId, hidden]);
  } else if (body.targetType === 'comment') {
    await queryRows(c.env.DATABASE_URL, `UPDATE comments SET is_hidden_by_admin = $2 WHERE id = $1`, [body.targetId, hidden]);
  } else if (body.targetType === 'segment') {
    await queryRows(c.env.DATABASE_URL, `UPDATE segments SET is_hidden_by_admin = $2 WHERE id = $1`, [body.targetId, hidden]);
  } else if (body.targetType === 'effort') {
    await queryRows(c.env.DATABASE_URL, `UPDATE segment_efforts SET is_hidden_by_admin = $2 WHERE id = $1`, [body.targetId, hidden]);
  } else if (body.targetType === 'user') {
    await queryRows(c.env.DATABASE_URL, `UPDATE users SET is_suspended = $2 WHERE id = $1`, [body.targetId, hidden]);
  }

  return c.json({ ok: true, hidden });
});

adminRouter.post('/cron/run', async (c) => {
  const heat = await rebuildAnonymizedHeatmap(c.env);
  await queryRows(c.env.DATABASE_URL, `DELETE FROM email_tokens WHERE expires_at < now() - interval '2 days'`);
  await queryRows(c.env.DATABASE_URL, `DELETE FROM sessions WHERE expires_at < now() - interval '7 days'`);
  return c.json({ ok: true, heatmap: heat });
});
