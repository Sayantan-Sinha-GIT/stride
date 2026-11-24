import { NextRequest, NextResponse } from 'next/server';

async function resolveLocalApk(variant: 'lite' | 'full'): Promise<{ buffer: Uint8Array; size: number } | undefined> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const candidates =
      variant === 'lite'
        ? [
            path.resolve(process.cwd(), '../app-lite/app/build/outputs/apk/release/app-release.apk'),
            path.resolve(process.cwd(), 'app-lite/app/build/outputs/apk/release/app-release.apk'),
            path.resolve(process.cwd(), '../app-lite/app/build/outputs/apk/debug/app-debug.apk'),
          ]
        : [
            path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-release.apk'),
            path.resolve(process.cwd(), 'app/build/app/outputs/flutter-apk/app-release.apk'),
            path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-debug.apk'),
          ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) return undefined;
    const stat = fs.statSync(found);
    const buffer = fs.readFileSync(found);
    return { buffer: new Uint8Array(buffer), size: stat.size };
  } catch {
    return undefined;
  }
}

function resolveVariant(request: NextRequest): { variant: 'lite' | 'full'; filename: string; externalUrl?: string } {
  const raw = request.nextUrl.searchParams.get('variant');
  if (raw === 'lite') {
    return {
      variant: 'lite',
      filename: 'stride-lite-android.apk',
      externalUrl: process.env.NEXT_PUBLIC_APK_LITE_DOWNLOAD_URL,
    };
  }
  return {
    variant: 'full',
    filename: 'stride-android.apk',
    externalUrl: process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL,
  };
}

export async function HEAD(request: NextRequest) {
  const { variant, filename, externalUrl } = resolveVariant(request);
  if (externalUrl) {
    return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const local = await resolveLocalApk(variant);
  if (local) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(local.size),
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ error: `${filename} unavailable` }, { status: 404 });
}

export async function GET(request: NextRequest) {
  const { variant, filename, externalUrl } = resolveVariant(request);
  if (externalUrl) {
    return NextResponse.redirect(externalUrl, 302);
  }

  const local = await resolveLocalApk(variant);
  if (local) {
    return new NextResponse(Buffer.from(local.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(local.size),
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(
    { error: `${filename} unavailable. Configure NEXT_PUBLIC_APK_${variant === 'lite' ? 'LITE_' : ''}DOWNLOAD_URL.` },
    { status: 404 }
  );
}
