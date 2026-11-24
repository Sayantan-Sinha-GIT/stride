interface Env {
  ASSETS: {
    fetch(input: RequestInfo | URL): Promise<Response>;
  };
}

interface VariantManifest {
  filename: string;
  size: number;
  sha256: string;
  parts: string[];
}

interface Manifest extends VariantManifest {
  full?: VariantManifest;
  lite?: VariantManifest;
}

interface WorkerCtx {
  waitUntil(promise: Promise<unknown>): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: WorkerCtx): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname === '/manifest.json') {
      const mRes = await env.ASSETS.fetch(new Request('https://assets.local/manifest.json'));
      const headers = new Headers(mRes.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=60');
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(request.method === 'HEAD' ? null : mRes.body, {
        status: mRes.status,
        headers,
      });
    }

    const isLite =
      url.pathname === '/stride-lite-android.apk' ||
      url.pathname === '/lite' ||
      url.pathname === '/app-lite-release.apk';
    const isFull =
      url.pathname === '/' ||
      url.pathname === '/stride-android.apk' ||
      url.pathname === '/app-release.apk';

    if (!isLite && !isFull) {
      return new Response('Not Found', { status: 404 });
    }

    const manifestRes = await env.ASSETS.fetch(new Request('https://assets.local/manifest.json'));
    if (!manifestRes.ok) {
      return new Response('APK manifest unavailable', { status: 500 });
    }
    const manifest = (await manifestRes.json()) as Manifest;
    const selected: VariantManifest = isLite
      ? manifest.lite ?? {
          filename: 'stride-lite-android.apk',
          size: manifest.size,
          sha256: manifest.sha256,
          parts: manifest.parts,
        }
      : manifest.full ?? manifest;

    if (isLite && !manifest.lite) {
      return new Response('Lite APK unavailable', { status: 404 });
    }

    const headers = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${selected.filename}"`,
      'Content-Length': String(selected.size),
      ETag: `"${selected.sha256}"`,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    const { readable, writable } = new TransformStream();
    ctx.waitUntil(
      (async () => {
        try {
          for (const part of selected.parts) {
            const partRes = await env.ASSETS.fetch(new Request(`https://assets.local${part}`));
            if (!partRes.ok || !partRes.body) {
              throw new Error(`Missing APK chunk: ${part}`);
            }
            await partRes.body.pipeTo(writable, { preventClose: true });
          }
          await writable.close();
        } catch (err) {
          await writable.abort(err);
        }
      })()
    );

    return new Response(readable, { status: 200, headers });
  },
};

export default worker;
