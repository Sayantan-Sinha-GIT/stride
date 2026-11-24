import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { haversineMeters } from '@stride/track-engine';
import { createApp } from '../src/index.js';
import { queryRows } from '../src/lib/db.js';
import type { Env } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = createApp();

const testEnv: Env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-that-is-32-chars-minimum-1234',
  APP_ORIGIN: 'http://localhost:3000',
  API_ORIGIN: 'http://127.0.0.1:8787',
  CORS_ORIGINS: 'http://localhost:3000',
};

function apiReq(urlPath: string, init: RequestInit = {}) {
  const req = new Request(`http://127.0.0.1:8787${urlPath}`, init);
  return app.fetch(req, testEnv);
}

describe('Stride API — Auth, Idempotency, Privacy & Authorization Matrix', () => {
  const testEmail = `e2e_${Date.now()}@stride.test`;
  const testHandle = `e2e_${Date.now()}`;
  let testAccess = '';
  let testRefresh = '';
  let testUserId = '';
  let arjunToken = '';
  let adminToken = '';

  beforeAll(async () => {
    if (!testEnv.DATABASE_URL) {
      throw new Error('DATABASE_URL missing for API tests');
    }

    const arjunLogin = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arjun@stride.demo', password: 'StrideDemo123!' }),
    });
    const arjunJson = (await arjunLogin.json()) as { accessToken: string };
    arjunToken = arjunJson.accessToken;

    const adminLogin = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stride.demo', password: 'StrideAdmin123!' }),
    });
    const adminJson = (await adminLogin.json()) as { accessToken: string };
    adminToken = adminJson.accessToken;
  });

  afterAll(async () => {
    if (testUserId) {
      await queryRows(testEnv.DATABASE_URL, `DELETE FROM users WHERE id = $1`, [testUserId]);
    }
  });

  it('responds healthy with live Neon PostGIS version', async () => {
    const res = await apiReq('/v1/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; postgis: string };
    expect(body.status).toBe('ok');
    expect(body.postgis.length).toBeGreaterThan(0);
  });

  it('completes signup, email verification, login, refresh rotation & token reuse revocation', async () => {
    const signupRes = await apiReq('/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'TestPassword123!',
        displayName: 'E2E Runner',
        handle: testHandle,
        language: 'en',
      }),
    });
    expect(signupRes.status).toBe(201);

    // Fetch verification code directly from DB (API intentionally omits secret codes in responses)
    const tokenRows = await queryRows<{ code_6: string; user_id: string }>(
      testEnv.DATABASE_URL,
      `SELECT code_6, user_id FROM email_tokens WHERE email = $1 AND purpose = 'verify_email' ORDER BY created_at DESC LIMIT 1`,
      [testEmail]
    );
    expect(tokenRows[0]?.code_6).toBeTruthy();
    testUserId = tokenRows[0].user_id;

    // Attempting login before verification fails with 403
    const preVerifyLogin = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'TestPassword123!' }),
    });
    expect(preVerifyLogin.status).toBe(403);

    const verifyRes = await apiReq('/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: tokenRows[0].code_6 }),
    });
    expect(verifyRes.status).toBe(200);

    const loginRes = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'TestPassword123!' }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = (await loginRes.json()) as { accessToken: string; refreshToken: string };
    testAccess = loginJson.accessToken;
    testRefresh = loginJson.refreshToken;

    // Refresh token rotation
    const ref1 = await apiReq('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: testRefresh }),
    });
    expect(ref1.status).toBe(200);
    const ref1Json = (await ref1.json()) as { accessToken: string; refreshToken: string };
    expect(ref1Json.refreshToken).not.toBe(testRefresh);

    // Reusing OLD refresh token triggers family revocation!
    const reuseRes = await apiReq('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: testRefresh }),
    });
    expect(reuseRes.status).toBe(401);

    // Even rotated token is now revoked because family was compromised
    const revokedFamilyRes = await apiReq('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: ref1Json.refreshToken }),
    });
    expect(revokedFamilyRes.status).toBe(401);

    // Log back in cleanly
    const relogin = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'TestPassword123!' }),
    });
    const reloginJson = (await relogin.json()) as { accessToken: string; refreshToken: string };
    testAccess = reloginJson.accessToken;
    testRefresh = reloginJson.refreshToken;
  });

  it('deduplicates idempotent activity uploads and clips privacy zones for non-owners', async () => {
    const idemp = `idem-${Date.now()}`;
    const t0 = Date.now() - 600_000;
    const pts = Array.from({ length: 12 }, (_, i) => ({
      lat: 12.9762 + i * 0.0005,
      lng: 77.5929,
      ele: 920,
      time: t0 + i * 15_000,
      accuracyM: 6,
    }));

    const create1 = await apiReq('/v1/activities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testAccess}`,
        'Idempotency-Key': idemp,
      },
      body: JSON.stringify({
        clientId: idemp,
        title: 'Idempotent Test Run',
        activityType: 'run',
        source: 'recorded',
        visibility: 'followers',
        points: pts,
      }),
    });
    expect(create1.status).toBe(201);
    const act1 = (await create1.json()) as { activity: { id: string } };

    const create2 = await apiReq('/v1/activities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testAccess}`,
        'Idempotency-Key': idemp,
      },
      body: JSON.stringify({
        clientId: idemp,
        title: 'Idempotent Test Run',
        activityType: 'run',
        source: 'recorded',
        visibility: 'followers',
        points: pts,
      }),
    });
    expect(create2.status).toBe(200);
    const act2 = (await create2.json()) as { deduplicated: boolean; activity: { id: string } };
    expect(act2.deduplicated).toBe(true);
    expect(act2.activity.id).toBe(act1.activity.id);

    // Arjun is NOT following testUser -> Arjun cannot read followers-only activity!
    const forbiddenFollowerView = await apiReq(`/v1/activities/${act1.activity.id}`, {
      headers: { Authorization: `Bearer ${arjunToken}` },
    });
    expect(forbiddenFollowerView.status).toBe(403);

    // Arjun's private activity is forbidden to testUser
    const arjunPrivateRows = await queryRows<{ id: string }>(
      testEnv.DATABASE_URL,
      `SELECT id FROM activities WHERE client_id = 'seed-arjun-private-recovery' LIMIT 1`
    );
    const privRes = await apiReq(`/v1/activities/${arjunPrivateRows[0].id}`, {
      headers: { Authorization: `Bearer ${testAccess}` },
    });
    expect(privRes.status).toBe(403);

    // Arjun's public Cubbon activity IS viewable by testUser, with Home privacy zone strictly stripped!
    const arjunPublicRows = await queryRows<{ id: string }>(
      testEnv.DATABASE_URL,
      `SELECT id FROM activities WHERE client_id = 'seed-arjun-cubbon-1' LIMIT 1`
    );
    const pubViewerRes = await apiReq(`/v1/activities/${arjunPublicRows[0].id}`, {
      headers: { Authorization: `Bearer ${testAccess}` },
    });
    expect(pubViewerRes.status).toBe(200);
    const pubJson = (await pubViewerRes.json()) as {
      activity: { privacyClipped: boolean; points: Array<{ lat: number; lng: number }> };
    };
    expect(pubJson.activity.privacyClipped).toBe(true);
    for (const pt of pubJson.activity.points) {
      expect(haversineMeters(pt, { lat: 12.9762, lng: 77.5929 })).toBeGreaterThan(250);
    }

    // Owner (Arjun) sees full unmasked track
    const ownerRes = await apiReq(`/v1/activities/${arjunPublicRows[0].id}`, {
      headers: { Authorization: `Bearer ${arjunToken}` },
    });
    const ownerJson = (await ownerRes.json()) as {
      activity: { privacyClipped: boolean; points: Array<{ lat: number; lng: number }> };
    };
    expect(ownerJson.activity.privacyClipped).toBe(false);
    expect(ownerJson.activity.points.length).toBeGreaterThan(pubJson.activity.points.length);
  });

  it('enforces heatmap contributor threshold >= 3 and admin RBAC', async () => {
    const heatRes = await apiReq('/v1/heatmap?city=bengaluru');
    expect(heatRes.status).toBe(200);
    const heatJson = (await heatRes.json()) as {
      minContributorsThreshold: number;
      cells: Array<{ contributor_count: number }>;
    };
    expect(heatJson.minContributorsThreshold).toBe(3);
    for (const c of heatJson.cells) {
      expect(c.contributor_count).toBeGreaterThanOrEqual(3);
    }

    // Non-admin user gets 403 on admin endpoint
    const nonAdmin = await apiReq('/v1/admin/stats', {
      headers: { Authorization: `Bearer ${testAccess}` },
    });
    expect(nonAdmin.status).toBe(403);

    // Admin user gets 200
    const adminOk = await apiReq('/v1/admin/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminOk.status).toBe(200);
  });

  it('rejects bad passwords, forged Google ID tokens, and supports account export + PostGIS nearby lookup', async () => {
    const badLogin = await apiReq('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arjun@stride.demo', password: 'WrongPassword999!' }),
    });
    expect(badLogin.status).toBe(401);

    const forgedGoogle = await apiReq('/v1/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'not.a.valid.jwt.token' }),
    });
    expect(forgedGoogle.status).toBe(401);

    const exportRes = await apiReq('/v1/me/export', {
      headers: { Authorization: `Bearer ${testAccess}` },
    });
    expect(exportRes.status).toBe(200);
    const exportJson = (await exportRes.json()) as { account: { id: string }; activities: unknown[] };
    expect(exportJson.account.id).toBe(testUserId);
    expect(Array.isArray(exportJson.activities)).toBe(true);

    const nearbyRes = await apiReq('/v1/routes/nearby?lat=12.9762&lng=77.5929&radiusKm=15');
    expect(nearbyRes.status).toBe(200);
    const nearbyJson = (await nearbyRes.json()) as { activities: unknown[]; segments: unknown[] };
    expect(Array.isArray(nearbyJson.activities)).toBe(true);
    expect(Array.isArray(nearbyJson.segments)).toBe(true);
  });

  it('deletes account cleanly with cascading removal', async () => {
    const delRes = await apiReq('/v1/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${testAccess}` },
    });
    expect(delRes.status).toBe(200);

    const checkUser = await queryRows<{ id: string }>(
      testEnv.DATABASE_URL,
      `SELECT id FROM users WHERE id = $1`,
      [testUserId]
    );
    expect(checkUser).toHaveLength(0);
    testUserId = '';
  });
});
