interface Env {
  ASSETS: {
    fetch(input: RequestInfo | URL): Promise<Response>;
  };
}

interface Manifest {
  filename: string;
  size: number;
  sha256: string;
  parts: string[];
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
      return env.ASSETS.fetch(new Request('https://assets.local/manifest.json'));
    }

    if (
      url.pathname !== '/' &&
      url.pathname !== '/stride-android.apk' &&
      url.pathname !== '/app-release.apk'
    ) {
      return new Response('Not Found', { status: 404 });
    }

    const manifestRes = await env.ASSETS.fetch(new Request('https://assets.local/manifest.json'));
    if (!manifestRes.ok) {
      return new Response('APK manifest unavailable', { status: 500 });
    }
    const manifest = (await manifestRes.json()) as Manifest;

    const headers = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${manifest.filename}"`,
      'Content-Length': String(manifest.size),
      ETag: `"${manifest.sha256}"`,
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
          for (const part of manifest.parts) {
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
