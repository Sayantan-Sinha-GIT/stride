import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rebuildAnonymizedHeatmap } from './lib/activityPipeline.js';
import { queryRows } from './lib/db.js';
import { activitiesRouter } from './routes/activities.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { authRouter } from './routes/auth.js';
import { communityRouter } from './routes/community.js';
import { mapsAndDiscoveryRouter } from './routes/mapsAndDiscovery.js';
import { meRouter } from './routes/me.js';
import { segmentsRouter } from './routes/segments.js';
import { socialRouter } from './routes/social.js';
import type { AppVariables, Env } from './types.js';

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    const allowedOrigins = (c.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const corsMiddleware = cors({
      origin: (origin) => {
        if (!origin) return allowedOrigins[0];
        if (allowedOrigins.includes(origin)) return origin;
        return '';
      },
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      maxAge: 86400,
    });
    return corsMiddleware(c, next);
  });

  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('X-Request-Id', c.get('requestId'));
  });

  app.get('/v1/health', async (c) => {
    const t0 = Date.now();
    try {
      const rows = await queryRows<{ postgis: string; ok: number }>(
        c.env.DATABASE_URL,
        `SELECT 1 AS ok, PostGIS_Version() AS postgis`
      );
      return c.json({
        status: 'ok',
        db: 'connected',
        postgis: rows[0]?.postgis || 'enabled',
        latencyMs: Date.now() - t0,
        mapProvider: c.env.OLA_MAPS_API_KEY ? 'ola' : 'openfreemap',
      });
    } catch (err) {
      return c.json(
        {
          status: 'degraded',
          db: 'error',
          message: err instanceof Error ? err.message : 'Database ping failed',
        },
        503
      );
    }
  });

  app.route('/v1/auth', authRouter);
  app.route('/v1/me', meRouter);
  app.route('/v1/activities', activitiesRouter);
  app.route('/v1/segments', segmentsRouter);
  app.route('/v1/analytics', analyticsRouter);
  app.route('/v1/admin', adminRouter);
  app.route('/v1', socialRouter);
  app.route('/v1', communityRouter);
  app.route('/v1', mapsAndDiscoveryRouter);

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404));

  app.onError((err, c) => {
    console.error('[Stride API Error]', err);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } },
      500
    );
  });

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await rebuildAnonymizedHeatmap(env);
        await queryRows(env.DATABASE_URL, `DELETE FROM email_tokens WHERE expires_at < now() - interval '2 days'`);
        await queryRows(env.DATABASE_URL, `DELETE FROM sessions WHERE expires_at < now() - interval '7 days'`);
      })()
    );
  },
};
