import { decodePolyline } from '@stride/track-engine';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';

  let title = 'Stride Activity';
  let subtitle = 'GPS Telemetry • Stride';
  let distText = '';
  let timeText = '';
  let pathD = '';

  try {
    const res = await fetch(`${base}/v1/activities/${id}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as {
        activity?: {
          title: string;
          distanceM: number;
          movingTimeS: number;
          elevationGainM: number;
          encodedPolyline: string;
          author?: { displayName: string; handle: string };
        };
      };
      if (json.activity) {
        const a = json.activity;
        title = a.title;
        subtitle = `${a.author?.displayName || 'Athlete'} (@${a.author?.handle || 'stride'})`;
        distText = `${(a.distanceM / 1000).toFixed(2)} km`;
        const m = Math.floor(a.movingTimeS / 60);
        const s = a.movingTimeS % 60;
        timeText = `${m}:${String(s).padStart(2, '0')} • +${Math.round(a.elevationGainM)}m`;

        const pts = decodePolyline(a.encodedPolyline || '');
        if (pts.length >= 2) {
          const lats = pts.map((p) => p.lat);
          const lngs = pts.map((p) => p.lng);
          const minLat = Math.min(...lats);
          const dLat = Math.max(0.0005, Math.max(...lats) - minLat);
          const minLng = Math.min(...lngs);
          const dLng = Math.max(0.0005, Math.max(...lngs) - minLng);
          pathD = pts
            .map((p, i) => {
              const x = 680 + ((p.lng - minLng) / dLng) * 440;
              const y = 510 - ((p.lat - minLat) / dLat) * 390;
              return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(' ');
        }
      }
    }
  } catch {
    // Serve clean default preview
  }

  const esc = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#080B0F" />
  <rect x="36" y="36" width="1128" height="558" rx="28" fill="#0F141B" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
  <text x="80" y="110" fill="#FF4D1C" font-family="sans-serif" font-size="24" font-weight="700">STRIDE TELEMETRY</text>
  <text x="80" y="180" fill="#F3F6FA" font-family="sans-serif" font-size="44" font-weight="700">${esc(title.slice(0, 32))}</text>
  <text x="80" y="232" fill="#A1AFC2" font-family="sans-serif" font-size="24">${esc(subtitle)}</text>
  <text x="80" y="370" fill="#F3F6FA" font-family="monospace" font-size="72" font-weight="700">${esc(distText)}</text>
  <text x="80" y="430" fill="#A1AFC2" font-family="monospace" font-size="30">${esc(timeText)}</text>
  <text x="80" y="540" fill="#708096" font-family="sans-serif" font-size="20">Privacy zones enforced server-side</text>
  ${pathD ? `<path d="${pathD}" fill="none" stroke="#FF4D1C" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />` : ''}
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
