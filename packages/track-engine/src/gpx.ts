import type { ActivityType, RawTrackPoint } from './types.js';

export interface ParsedGpx {
  name: string | null;
  activityType: ActivityType | null;
  points: RawTrackPoint[];
}

const MAX_GPX_BYTES = 5 * 1024 * 1024;
const MAX_GPX_POINTS = 100_000;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapGpxType(raw: string | null): ActivityType | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('run')) return 'run';
  if (lower.includes('cycl') || lower.includes('bike') || lower.includes('ride')) return 'ride';
  if (lower.includes('hike')) return 'hike';
  if (lower.includes('walk')) return 'walk';
  return null;
}

export function parseGpx(xml: string): ParsedGpx {
  if (!xml || typeof xml !== 'string') {
    throw new Error('GPX payload is empty');
  }
  if (xml.length > MAX_GPX_BYTES) {
    throw new Error('GPX payload exceeds 5 MB limit');
  }
  if (!/<gpx[\s>]/i.test(xml)) {
    throw new Error('Invalid GPX file: missing <gpx> root element');
  }

  const nameMatch = xml.match(/<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/i) ??
    xml.match(/<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  const typeMatch = xml.match(/<trk>[\s\S]*?<type>([\s\S]*?)<\/type>/i);

  const name = nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : null;
  const activityType = mapGpxType(typeMatch ? typeMatch[1].trim() : null);

  const points: RawTrackPoint[] = [];
  const ptRegex = /<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>|<(?:trkpt|rtept)\b([^>]*)\/>/gi;
  let match: RegExpExecArray | null;
  let fallbackTime = Date.now() - 3600_000;

  while ((match = ptRegex.exec(xml)) !== null) {
    if (points.length >= MAX_GPX_POINTS) {
      throw new Error('GPX track exceeds maximum supported point count');
    }
    const attrs = match[1] ?? match[3] ?? '';
    const inner = match[2] ?? '';

    const latMatch = attrs.match(/\blat\s*=\s*["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon\s*=\s*["']([^"']+)["']/i);
    if (!latMatch || !lonMatch) continue;

    const lat = Number(latMatch[1]);
    const lng = Number(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
    const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
    const hrMatch = inner.match(/<(?:gpxtpx:)?hr>([^<]+)<\/(?:gpxtpx:)?hr>/i);

    let timeMs = fallbackTime;
    if (timeMatch) {
      const parsed = Date.parse(timeMatch[1].trim());
      if (Number.isFinite(parsed)) {
        timeMs = parsed;
      }
    } else {
      fallbackTime += 1000;
    }

    points.push({
      lat,
      lng,
      ele: eleMatch && Number.isFinite(Number(eleMatch[1])) ? Number(eleMatch[1]) : 0,
      time: timeMs,
      hr: hrMatch && Number.isFinite(Number(hrMatch[1])) ? Number(hrMatch[1]) : null,
    });
  }

  if (points.length < 2) {
    throw new Error('GPX file contains fewer than 2 valid track points');
  }

  return { name, activityType, points };
}

export function serializeGpx(input: {
  title: string;
  activityType: ActivityType;
  startedAtIso: string;
  points: Array<{ lat: number; lng: number; ele?: number; time: number; hr?: number | null }>;
}): string {
  const trkpts = input.points
    .map((p) => {
      const eleTag = p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : '';
      const timeTag = `<time>${new Date(p.time).toISOString()}</time>`;
      const hrTag =
        p.hr != null
          ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
          : '';
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${eleTag}${timeTag}${hrTag}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Stride" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${escapeXml(input.title)}</name>
    <time>${escapeXml(input.startedAtIso)}</time>
  </metadata>
  <trk>
    <name>${escapeXml(input.title)}</name>
    <type>${escapeXml(input.activityType)}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
