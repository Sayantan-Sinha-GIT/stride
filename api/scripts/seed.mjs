import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import {
  detectPersonalRecords,
  encodePolyline,
  matchActivityToSegment,
  processTrack,
  toWktLineString,
  validateNewSegment,
} from '../../packages/track-engine/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiDir, '.env') });

if (typeof WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = WebSocket;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

function hashPasswordNode(password) {
  const iterations = 100_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function buildRoutePoints(waypoints, totalDurationS, startTimeMs, baseEle, eleWaveAmp = 8) {
  const dense = [];
  const stepsPerLeg = 45;
  const totalLegs = waypoints.length - 1;
  const totalSamples = totalLegs * stepsPerLeg;
  let idx = 0;

  for (let leg = 0; leg < totalLegs; leg++) {
    const [lat1, lng1] = waypoints[leg];
    const [lat2, lng2] = waypoints[leg + 1];
    for (let s = 0; s < (leg === totalLegs - 1 ? stepsPerLeg + 1 : stepsPerLeg); s++) {
      const t = s / stepsPerLeg;
      const frac = idx / totalSamples;
      dense.push({
        lat: lat1 + (lat2 - lat1) * t + Math.sin(idx * 0.4) * 0.000015,
        lng: lng1 + (lng2 - lng1) * t + Math.cos(idx * 0.4) * 0.000015,
        ele: Number((baseEle + Math.sin(frac * Math.PI * 2) * eleWaveAmp + frac * 12).toFixed(1)),
        time: startTimeMs + Math.round(frac * totalDurationS * 1000),
        accuracyM: 5,
      });
      idx++;
    }
  }
  return dense;
}

// Realistic city corridors in Bengaluru, Mumbai, Kolkata, New Delhi
const CUBBON_PARK_WAYPOINTS = [
  [12.9762, 77.5929],
  [12.9792, 77.5955],
  [12.9788, 77.5992],
  [12.9746, 77.6004],
  [12.9718, 77.5968],
  [12.9729, 77.5916],
  [12.9756, 77.5923],
];

const MARINE_DRIVE_WAYPOINTS = [
  [18.9438, 72.8231],
  [18.9382, 72.8247],
  [18.9315, 72.8258],
  [18.9261, 72.8242],
  [18.9322, 72.8255],
  [18.9394, 72.8244],
  [18.9445, 72.8229],
];

const MAIDAN_LOOP_WAYPOINTS = [
  [22.5494, 88.3478],
  [22.5542, 88.3501],
  [22.5561, 88.3455],
  [22.5518, 88.3412],
  [22.5461, 88.3429],
  [22.5488, 88.3472],
];

const LODHI_GARDEN_WAYPOINTS = [
  [28.5931, 77.2197],
  [28.5954, 77.2238],
  [28.5928, 77.2279],
  [28.5896, 77.2241],
  [28.5909, 77.2189],
  [28.5928, 77.2194],
];

const NANDI_CLIMB_WAYPOINTS = [
  [13.3685, 77.6845],
  [13.3722, 77.6869],
  [13.3765, 77.6841],
  [13.3802, 77.6882],
  [13.3849, 77.6848],
  [13.3886, 77.6831],
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding badges...');
    const badgeDefs = [
      ['first_activity', 'First Stride', 'पहला कदम', 'Recorded or imported your first activity', 'अपनी पहली गतिविधि रिकॉर्ड या इम्पोर्ट की', 'milestone'],
      ['ten_k_finisher', '10K Finisher', '10K फिनिशर', 'Completed a 10 km or longer run', '10 किमी या अधिक की दौड़ पूरी की', 'distance'],
      ['distance_50k', '50 km Club', '50 किमी क्लब', 'Logged 50 total kilometers across activities', 'सभी गतिविधियों में कुल 50 किमी पूरे किए', 'distance'],
      ['distance_100k', 'Century Athlete', 'सेंचुरी एथलीट', 'Logged 100 total kilometers on Stride', 'Stride पर कुल 100 किमी पूरे किए', 'distance'],
      ['hill_climber', 'Summit Seeker', 'शिखर आरोही', 'Gained 300m+ elevation in a single session', 'एक सत्र में 300मी+ ऊंचाई चढ़ी', 'elevation'],
      ['november_100k', 'Monthly 100K Finisher', 'मासिक 100K विजेता', 'Completed the Monthly 100 km Endurance Challenge', 'मासिक 100 किमी चैलेंज पूरा किया', 'challenge'],
    ];

    for (const [code, te, th, de, dh, cat] of badgeDefs) {
      await client.query(
        `INSERT INTO badges (code, title_en, title_hi, description_en, description_hi, category)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET title_en = EXCLUDED.title_en, title_hi = EXCLUDED.title_hi`,
        [code, te, th, de, dh, cat]
      );
    }

    const demoPassHash = hashPasswordNode('StrideDemo123!');
    const adminPassHash = hashPasswordNode('StrideAdmin123!');

    const usersSpec = [
      {
        email: 'arjun@stride.demo',
        handle: 'arjun_runs',
        displayName: 'Arjun Deshmukh',
        bio: 'Dawn runner around Cubbon Park & weekend Nandi Hills cyclist. Chasing sub-40 10K.',
        city: 'Bengaluru',
        role: 'user',
        lang: 'en',
        passHash: demoPassHash,
        weight: 69,
      },
      {
        email: 'admin@stride.demo',
        handle: 'priya_admin',
        displayName: 'Priya Nair',
        bio: 'Marine Drive distance athlete & Stride community steward.',
        city: 'Mumbai',
        role: 'admin',
        lang: 'en',
        passHash: adminPassHash,
        weight: 58,
      },
      {
        email: 'rohan@stride.demo',
        handle: 'rohan_kolkata',
        displayName: 'रोहन चटर्जी',
        bio: 'कोलकाता मैदान सुबह की दौड़ और हेरिटेज वॉक प्रेमी।',
        city: 'Kolkata',
        role: 'user',
        lang: 'hi',
        passHash: demoPassHash,
        weight: 72,
      },
      {
        email: 'ananya@stride.demo',
        handle: 'ananya_velo',
        displayName: 'Ananya Rao',
        bio: 'Endurance road cyclist, gravel explorer & segment hunter.',
        city: 'Bengaluru',
        role: 'user',
        lang: 'en',
        passHash: demoPassHash,
        weight: 60,
      },
      {
        email: 'vikram@stride.demo',
        handle: 'vikram_delhi',
        displayName: 'Vikramjit Gill',
        bio: 'Lodhi Garden tempo runner and marathon pacer.',
        city: 'New Delhi',
        role: 'user',
        lang: 'en',
        passHash: demoPassHash,
        weight: 75,
      },
      {
        email: 'meera@stride.demo',
        handle: 'meera_walks',
        displayName: 'Meera Kulkarni',
        bio: 'Mindful dawn walks, hill hikes & coastal sunrise loops.',
        city: 'Mumbai',
        role: 'user',
        lang: 'en',
        passHash: demoPassHash,
        weight: 57,
      },
    ];

    const userIds = {};
    for (const u of usersSpec) {
      const res = await client.query(
        `INSERT INTO users (email, email_verified, handle, display_name, bio, home_city, weight_kg, role)
         VALUES ($1, true, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, home_city = EXCLUDED.home_city, role = EXCLUDED.role
         RETURNING id`,
        [u.email, u.handle, u.displayName, u.bio, u.city, u.weight, u.role]
      );
      const uid = res.rows[0].id;
      userIds[u.handle] = uid;

      await client.query(
        `INSERT INTO auth_identities (user_id, provider, provider_user_id, password_hash)
         VALUES ($1, 'email', $2, $3)
         ON CONFLICT (user_id, provider) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [uid, u.email, u.passHash]
      );
      await client.query(
        `INSERT INTO user_settings (user_id, theme, language, units, default_visibility, hide_start_end_meters)
         VALUES ($1, 'dark', $2, 'metric', 'followers', 150)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid, u.lang]
      );
      await client.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [uid]
      );
    }

    // Follows among demo athletes
    const followPairs = [
      ['arjun_runs', 'priya_admin'],
      ['arjun_runs', 'rohan_kolkata'],
      ['arjun_runs', 'ananya_velo'],
      ['arjun_runs', 'vikram_delhi'],
      ['priya_admin', 'arjun_runs'],
      ['rohan_kolkata', 'arjun_runs'],
      ['ananya_velo', 'arjun_runs'],
      ['meera_walks', 'priya_admin'],
    ];
    for (const [f1, f2] of followPairs) {
      await client.query(
        `INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING`,
        [userIds[f1], userIds[f2]]
      );
    }

    // Privacy zones for Arjun & Priya (centered right on start of Cubbon Park & Marine Drive!)
    await client.query(
      `INSERT INTO privacy_zones (id, user_id, name, lat, lng, radius_meters, center_geog)
       VALUES ('11111111-1111-4111-8111-111111111101', $1, 'Home — Queen''s Road', 12.9762, 77.5929, 250, ST_SetSRID(ST_MakePoint(77.5929, 12.9762), 4326)::geography)
       ON CONFLICT (id) DO NOTHING`,
      [userIds.arjun_runs]
    );

    // Gear for Arjun
    const gearRes = await client.query(
      `INSERT INTO gear (id, user_id, name, gear_type, brand, initial_distance_m, max_distance_m, is_primary)
       VALUES ('22222222-2222-4222-8222-222222222201', $1, 'ASICS Novablast 4', 'shoes', 'ASICS', 142000, 750000, true)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [userIds.arjun_runs]
    );
    const arjunShoeId = gearRes.rows[0]?.id || '22222222-2222-4222-8222-222222222201';

    // Goals for Arjun
    await client.query(
      `INSERT INTO goals (id, user_id, period, activity_type, metric_type, target_value)
       VALUES
         ('33333333-3333-4333-8333-333333333301', $1, 'weekly', 'run', 'distance_m', 35000),
         ('33333333-3333-4333-8333-333333333302', $1, 'monthly', 'all', 'activity_count', 16)
       ON CONFLICT (id) DO NOTHING`,
      [userIds.arjun_runs]
    );

    // Seed Activities across cities & dates (with real processed tracks)
    const now = Date.now();
    const dayMs = 86400 * 1000;
    const activitiesSpec = [
      {
        clientId: 'seed-arjun-cubbon-1',
        handle: 'arjun_runs',
        title: 'Cubbon Dawn Negative Split',
        description: 'Crisp Bengaluru morning tempo through Queen Victoria & Bandstand loop.',
        type: 'run',
        visibility: 'public',
        waypoints: CUBBON_PARK_WAYPOINTS,
        durationS: 1480,
        startMs: now - 1 * dayMs,
        baseEle: 920,
        gearId: arjunShoeId,
      },
      {
        clientId: 'seed-arjun-nandi-ride',
        handle: 'arjun_runs',
        title: 'Nandi Base Elevation Ride',
        description: 'Steady cadence climbing out towards Sultanpet bend.',
        type: 'ride',
        visibility: 'public',
        waypoints: NANDI_CLIMB_WAYPOINTS,
        durationS: 1120,
        startMs: now - 4 * dayMs,
        baseEle: 960,
        eleWaveAmp: 36,
      },
      {
        clientId: 'seed-arjun-private-recovery',
        handle: 'arjun_runs',
        title: 'Late Evening Recovery Jog (Private)',
        description: 'Easy shakeout kept private inside account.',
        type: 'run',
        visibility: 'private',
        waypoints: CUBBON_PARK_WAYPOINTS.slice(0, 5),
        durationS: 980,
        startMs: now - 6 * dayMs,
        baseEle: 920,
      },
      {
        clientId: 'seed-ananya-cubbon-pace',
        handle: 'ananya_velo',
        title: 'Cubbon Park Morning Run',
        description: 'Cross-training dawn loop around Cubbon Park.',
        type: 'run',
        visibility: 'public',
        waypoints: CUBBON_PARK_WAYPOINTS,
        durationS: 1590,
        startMs: now - 2 * dayMs,
        baseEle: 920,
      },
      {
        clientId: 'seed-priya-marine-run',
        handle: 'priya_admin',
        title: 'Marine Drive Promenade Tempo',
        description: 'Sea breeze progression down Queen’s Necklace toward Nariman Point.',
        type: 'run',
        visibility: 'public',
        waypoints: MARINE_DRIVE_WAYPOINTS,
        durationS: 1710,
        startMs: now - 1.5 * dayMs,
        baseEle: 6,
      },
      {
        clientId: 'seed-meera-marine-walk',
        handle: 'meera_walks',
        title: 'Queen’s Necklace Sunset Walk',
        description: 'Brisk twilight recovery walk by the Arabian Sea.',
        type: 'walk',
        visibility: 'public',
        waypoints: MARINE_DRIVE_WAYPOINTS,
        durationS: 3400,
        startMs: now - 3 * dayMs,
        baseEle: 6,
      },
      {
        clientId: 'seed-rohan-maidan-hi',
        handle: 'rohan_kolkata',
        title: 'मैदान विक्टोरिया सुबह की दौड़',
        description: 'धुंधली सुबह में रेड रोड और विक्टोरिया मेमोरियल के चारों ओर 5 किमी।',
        type: 'run',
        visibility: 'public',
        waypoints: MAIDAN_LOOP_WAYPOINTS,
        durationS: 1620,
        startMs: now - 2.5 * dayMs,
        baseEle: 11,
      },
      {
        clientId: 'seed-vikram-lodhi',
        handle: 'vikram_delhi',
        title: 'Lodhi Garden Heritage Intervals',
        description: 'Fast 5x400m bursts between the tombs in cool Delhi morning air.',
        type: 'run',
        visibility: 'followers',
        waypoints: LODHI_GARDEN_WAYPOINTS,
        durationS: 1380,
        startMs: now - 2 * dayMs,
        baseEle: 215,
      },
    ];

    const activityIds = {};
    const processedMap = {};

    for (const spec of activitiesSpec) {
      const uid = userIds[spec.handle];
      const rawPts = buildRoutePoints(spec.waypoints, spec.durationS, spec.startMs, spec.baseEle, spec.eleWaveAmp || 6);
      const proc = processTrack(rawPts, { activityType: spec.type, weightKg: 68 });
      const startPt = proc.points[0];

      const ins = await client.query(
        `INSERT INTO activities (
           user_id, client_id, idempotency_key, title, description, activity_type, source, visibility,
           started_at, ended_at, timezone, distance_m, moving_time_s, elapsed_time_s,
           elevation_gain_m, elevation_loss_m, avg_speed_mps, max_speed_mps, calories_estimate,
           encoded_polyline, raw_points_json, splits_json, stream_json,
           geom, start_point, bbox, gear_id
         ) VALUES (
           $1, $2, $2, $3, $4, $5, 'recorded', $6,
           $7::timestamptz, $8::timestamptz, 'Asia/Kolkata', $9, $10, $11,
           $12, $13, $14, $15, $16,
           $17, $18::jsonb, $19::jsonb, $20::jsonb,
           ST_GeomFromText($21, 4326),
           ST_SetSRID(ST_MakePoint($23, $22), 4326),
           ST_MakeEnvelope($25 - 0.0001, $24 - 0.0001, $27 + 0.0001, $26 + 0.0001, 4326),
           $28
         )
         ON CONFLICT (user_id, client_id) DO UPDATE SET
           title = EXCLUDED.title,
           distance_m = EXCLUDED.distance_m,
           moving_time_s = EXCLUDED.moving_time_s,
           elapsed_time_s = EXCLUDED.elapsed_time_s,
           avg_speed_mps = EXCLUDED.avg_speed_mps,
           elevation_gain_m = EXCLUDED.elevation_gain_m,
           calories_estimate = EXCLUDED.calories_estimate,
           encoded_polyline = EXCLUDED.encoded_polyline,
           raw_points_json = EXCLUDED.raw_points_json,
           splits_json = EXCLUDED.splits_json,
           stream_json = EXCLUDED.stream_json
         RETURNING id`,
        [
          uid,
          spec.clientId,
          spec.title,
          spec.description,
          spec.type,
          spec.visibility,
          proc.startedAtIso,
          proc.endedAtIso,
          proc.distanceM,
          proc.movingTimeS,
          proc.elapsedTimeS,
          proc.elevationGainM,
          proc.elevationLossM,
          proc.avgSpeedMps,
          proc.maxSpeedMps,
          proc.caloriesEstimate,
          proc.encodedPolyline,
          JSON.stringify(proc.points),
          JSON.stringify(proc.splitsKm),
          JSON.stringify(proc.stream),
          proc.wktLineString,
          startPt.lat,
          startPt.lng,
          proc.bbox.minLat,
          proc.bbox.minLng,
          proc.bbox.maxLat,
          proc.bbox.maxLng,
          spec.gearId ?? null,
        ]
      );
      const actId = ins.rows[0].id;
      activityIds[spec.clientId] = actId;
      processedMap[spec.clientId] = { proc, uid, type: spec.type };

      // Insert PRs
      const prs = detectPersonalRecords(
        proc.points,
        spec.type,
        'recorded',
        proc.elevationGainM,
        proc.distanceM,
        proc.elapsedTimeS
      );
      for (const pr of prs) {
        await client.query(
          `INSERT INTO personal_records (user_id, metric_key, activity_type, activity_id, value_num, distance_m, duration_s, achieved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
           ON CONFLICT (user_id, metric_key) DO NOTHING`,
          [uid, pr.metricKey, pr.activityType, actId, pr.valueNum, pr.distanceM, pr.durationS, proc.startedAtIso]
        );
      }
    }

    // Update gear mileage
    await client.query(
      `UPDATE gear SET logged_distance_m = COALESCE((SELECT SUM(distance_m) FROM activities WHERE gear_id = $1), 0) WHERE id = $1`,
      [arjunShoeId]
    );

    // Seed Segments from Cubbon Park, Marine Drive, Nandi Climb & Maidan
    const segSpecs = [
      {
        id: '44444444-4444-4444-8444-444444444401',
        name: 'Cubbon Kings Way Dash',
        city: 'Bengaluru',
        type: 'run',
        actKey: 'seed-arjun-cubbon-1',
        creator: userIds.arjun_runs,
        sliceStart: 12,
        sliceEnd: 48,
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        name: 'Marine Drive Queen’s Necklace Sprint',
        city: 'Mumbai',
        type: 'run',
        actKey: 'seed-priya-marine-run',
        creator: userIds.priya_admin,
        sliceStart: 8,
        sliceEnd: 42,
      },
      {
        id: '44444444-4444-4444-8444-444444444403',
        name: 'Maidan Victoria Red Road',
        city: 'Kolkata',
        type: 'run',
        actKey: 'seed-rohan-maidan-hi',
        creator: userIds.rohan_kolkata,
        sliceStart: 6,
        sliceEnd: 38,
      },
      {
        id: '44444444-4444-4444-8444-444444444404',
        name: 'Nandi Hills Lower Switchback',
        city: 'Bengaluru',
        type: 'ride',
        actKey: 'seed-arjun-nandi-ride',
        creator: userIds.arjun_runs,
        sliceStart: 5,
        sliceEnd: 50,
      },
    ];

    for (const s of segSpecs) {
      const sourceProc = processedMap[s.actKey].proc;
      const slice = sourceProc.points.slice(s.sliceStart, s.sliceEnd);
      const val = validateNewSegment(slice, s.type, []);
      if (!val.valid) continue;

      const cleanPts = slice.map((p) => ({ lat: p.lat, lng: p.lng }));
      const poly = encodePolyline(cleanPts);
      const wkt = toWktLineString(cleanPts);
      const lats = cleanPts.map((p) => p.lat);
      const lngs = cleanPts.map((p) => p.lng);

      await client.query(
        `INSERT INTO segments (
           id, creator_id, source_activity_id, name, city, activity_type, distance_m,
           elevation_gain_m, elevation_loss_m, encoded_polyline, points_json,
           geom, start_point, end_point, bbox
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
           ST_GeomFromText($12, 4326),
           ST_SetSRID(ST_MakePoint($14, $13), 4326),
           ST_SetSRID(ST_MakePoint($16, $15), 4326),
           ST_MakeEnvelope($17 - 0.0001, $18 - 0.0001, $19 + 0.0001, $20 + 0.0001, 4326)
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          s.id,
          s.creator,
          activityIds[s.actKey],
          s.name,
          s.city,
          s.type,
          val.distanceM,
          val.elevationGainM,
          val.elevationLossM,
          poly,
          JSON.stringify(cleanPts),
          wkt,
          cleanPts[0].lat,
          cleanPts[0].lng,
          cleanPts[cleanPts.length - 1].lat,
          cleanPts[cleanPts.length - 1].lng,
          Math.min(...lngs),
          Math.min(...lats),
          Math.max(...lngs),
          Math.max(...lats),
        ]
      );

      // Match against seeded activities
      for (const [key, item] of Object.entries(processedMap)) {
        const match = matchActivityToSegment(
          item.proc.points,
          { id: s.id, name: s.name, activityType: s.type, distanceM: val.distanceM, points: cleanPts },
          item.type,
          'recorded'
        );
        if (!match.matched || match.elapsedTimeS == null) continue;
        await client.query(
          `INSERT INTO segment_efforts (segment_id, activity_id, user_id, elapsed_time_s, avg_speed_mps, max_speed_mps, start_offset_s, end_offset_s, is_pr, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::timestamptz)
           ON CONFLICT (segment_id, activity_id) DO NOTHING`,
          [
            s.id,
            activityIds[key],
            item.uid,
            match.elapsedTimeS,
            match.avgSpeedMps ?? 0,
            match.maxSpeedMps ?? 0,
            match.startOffsetS ?? 0,
            match.endOffsetS ?? 0,
            item.proc.startedAtIso,
          ]
        );
      }

      await client.query(
        `UPDATE segments SET effort_count = (SELECT COUNT(*) FROM segment_efforts WHERE segment_id = $1 AND is_flagged = false) WHERE id = $1`,
        [s.id]
      );
    }

    // Clubs, Challenges, Events
    const clubsSpec = [
      ['55555555-5555-4555-8555-555555555501', 'cubbon-dawn-pacers', 'Cubbon Dawn Pacers', 'Daily 5:45 AM group intervals, weekend long runs & filter coffee in central Bengaluru.', 'Bengaluru', 'run', 'open', userIds.arjun_runs],
      ['55555555-5555-4555-8555-555555555502', 'marine-drive-peloton', 'Marine Drive Peloton', 'Coastal distance runners and sunrise riders along Mumbai’s waterfront.', 'Mumbai', 'all', 'open', userIds.priya_admin],
      ['55555555-5555-4555-8555-555555555503', 'kolkata-maidan-striders', 'कोलकाता मैदान स्ट्राइडर्स', 'सुबह 6 बजे विक्टोरिया मेमोरियल और रेड रोड रनिंग क्लब।', 'Kolkata', 'run', 'approval', userIds.rohan_kolkata],
    ];
    for (const [id, slug, name, desc, city, sport, mode, owner] of clubsSpec) {
      await client.query(
        `INSERT INTO clubs (id, slug, name, description, city, sport_focus, join_mode, owner_id, member_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1) ON CONFLICT (id) DO NOTHING`,
        [id, slug, name, desc, city, sport, mode, owner]
      );
      await client.query(
        `INSERT INTO club_members (club_id, user_id, role, status) VALUES ($1, $2, 'admin', 'accepted') ON CONFLICT DO NOTHING`,
        [id, owner]
      );
    }
    await client.query(
      `INSERT INTO club_members (club_id, user_id, role, status) VALUES
         ('55555555-5555-4555-8555-555555555501', $1, 'member', 'accepted'),
         ('55555555-5555-4555-8555-555555555502', $2, 'member', 'accepted')
       ON CONFLICT DO NOTHING`,
      [userIds.ananya_velo, userIds.arjun_runs]
    );
    await client.query(
      `UPDATE clubs SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = clubs.id AND status = 'accepted')`
    );

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();

    await client.query(
      `INSERT INTO challenges (id, slug, club_id, creator_id, title, description, activity_type, metric_type, target_value, starts_at, ends_at, badge_code, participant_count)
       VALUES
         ('66666666-6666-4666-8666-666666666601', 'monthly-100k-endurance', NULL, $1, 'Monthly 100 km Endurance', 'Log 100 kilometers of running or walking across the month to unlock the Century badge.', 'run', 'distance_m', 100000, $2::timestamptz, $3::timestamptz, 'november_100k', 3),
         ('66666666-6666-4666-8666-666666666602', 'monsoon-elevation-1500m', '55555555-5555-4555-8555-555555555501', $1, '1,500m Climb Challenge', 'Accumulate 1,500 meters of vertical ascent across rides, runs, and hikes.', 'all', 'elevation_m', 1500, $2::timestamptz, $3::timestamptz, 'hill_climber', 2)
       ON CONFLICT (id) DO NOTHING`,
      [userIds.arjun_runs, monthStart, monthEnd]
    );

    await client.query(
      `INSERT INTO challenge_participants (challenge_id, user_id, progress_value, completed)
       VALUES
         ('66666666-6666-4666-8666-666666666601', $1, 18400, false),
         ('66666666-6666-4666-8666-666666666601', $2, 14200, false),
         ('66666666-6666-4666-8666-666666666601', $3, 9600, false),
         ('66666666-6666-4666-8666-666666666602', $1, 480, false),
         ('66666666-6666-4666-8666-666666666602', $4, 310, false)
       ON CONFLICT DO NOTHING`,
      [userIds.arjun_runs, userIds.priya_admin, userIds.rohan_kolkata, userIds.ananya_velo]
    );

    // Events
    const nextSun = new Date(Date.now() + 5 * dayMs).toISOString();
    await client.query(
      `INSERT INTO events (id, club_id, creator_id, title, description, city, location_name, lat, lng, activity_type, starts_at)
       VALUES
         ('77777777-7777-4777-8777-777777777701', '55555555-5555-4555-8555-555555555501', $1, 'Sunday 10K Tempo Meet-up', 'Paced 5:00/km and 5:45/km groups starting outside Cubbon Bandstand.', 'Bengaluru', 'Cubbon Park Bandstand', 12.9762, 77.5929, 'run', $2::timestamptz),
         ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555502', $3, 'Nariman Point Dawn Ride', '45km conversational peloton before city traffic wakes up.', 'Mumbai', 'Marine Drive Air India Plaza', 18.9261, 72.8242, 'ride', $2::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [userIds.arjun_runs, nextSun, userIds.priya_admin]
    );

    // Badges awarded
    await client.query(
      `INSERT INTO user_badges (user_id, badge_code) VALUES
         ($1, 'first_activity'),
         ($1, 'distance_50k'),
         ($2, 'first_activity'),
         ($3, 'first_activity')
       ON CONFLICT DO NOTHING`,
      [userIds.arjun_runs, userIds.priya_admin, userIds.rohan_kolkata]
    );

    // Kudos & Comments
    await client.query(
      `INSERT INTO kudos (activity_id, user_id) VALUES
         ($1, $2), ($1, $3), ($1, $4), ($5, $6)
       ON CONFLICT DO NOTHING`,
      [
        activityIds['seed-arjun-cubbon-1'],
        userIds.priya_admin,
        userIds.rohan_kolkata,
        userIds.ananya_velo,
        activityIds['seed-priya-marine-run'],
        userIds.arjun_runs,
      ]
    );
    await client.query(
      `UPDATE activities SET kudos_count = (SELECT COUNT(*) FROM kudos WHERE kudos.activity_id = activities.id)`
    );

    await client.query(
      `INSERT INTO comments (id, activity_id, user_id, body) VALUES
         ('88888888-8888-4888-8888-888888888801', $1, $2, 'Smooth negative split on the final kilometer!'),
         ('88888888-8888-4888-8888-888888888802', $1, $3, 'शानदार रफ़्तार अर्जुन भाई! सुबह-सुबह बढ़िया पेस।')
       ON CONFLICT (id) DO NOTHING`,
      [activityIds['seed-arjun-cubbon-1'], userIds.priya_admin, userIds.rohan_kolkata]
    );
    await client.query(
      `UPDATE activities SET comment_count = (SELECT COUNT(*) FROM comments WHERE comments.activity_id = activities.id)`
    );

    // Seed anonymized city heatmap cells (contributor_count >= 3 strictly satisfied)
    const heatCorridors = [
      ...CUBBON_PARK_WAYPOINTS.map((p, i) => ({ city: 'bengaluru', lat: p[0], lng: p[1], w: 18 + i * 3, c: 12 })),
      ...MARINE_DRIVE_WAYPOINTS.map((p, i) => ({ city: 'mumbai', lat: p[0], lng: p[1], w: 22 + i * 4, c: 15 })),
      ...MAIDAN_LOOP_WAYPOINTS.map((p, i) => ({ city: 'kolkata', lat: p[0], lng: p[1], w: 16 + i * 2, c: 9 })),
      ...LODHI_GARDEN_WAYPOINTS.map((p, i) => ({ city: 'new delhi', lat: p[0], lng: p[1], w: 19 + i * 3, c: 11 })),
    ];
    for (const h of heatCorridors) {
      const qLat = Math.round(h.lat * 500) / 500;
      const qLng = Math.round(h.lng * 500) / 500;
      const cid = `${qLat.toFixed(3)}:${qLng.toFixed(3)}`;
      for (const sport of ['all', 'run']) {
        await client.query(
          `INSERT INTO heatmap_cells (cell_id, city, activity_type, lat, lng, weight, contributor_count, geom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($5, $4), 4326))
           ON CONFLICT (cell_id, activity_type) DO UPDATE SET weight = EXCLUDED.weight, contributor_count = EXCLUDED.contributor_count`,
          [cid, h.city, sport, qLat, qLng, h.w, h.c]
        );
      }
    }

    // One sample open report so Admin moderation panel has a live item immediately
    await client.query(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status)
       VALUES ('99999999-9999-4999-8999-999999999901', $1, 'segment', '44444444-4444-4444-8444-444444444401', 'GPS Calibration Check', 'Sample community review item for moderator queue.', 'open')
       ON CONFLICT (id) DO NOTHING`,
      [userIds.ananya_velo]
    );

    console.log('Seed completed cleanly!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
