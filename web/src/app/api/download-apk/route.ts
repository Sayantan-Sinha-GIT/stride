import { NextResponse } from 'next/server';

async function resolveLocalApk(): Promise<{ buffer: Uint8Array; size: number } | undefined> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const candidates = [
      path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-release.apk'),
      path.resolve(process.cwd(), 'app/build/app/outputs/flutter-apk/app-release.apk'),
      path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-debug.apk'),
      path.resolve(process.cwd(), 'app/build/app/outputs/flutter-apk/app-debug.apk'),
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

export async function HEAD() {
  const externalUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL;
  if (externalUrl) {
    return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const local = await resolveLocalApk();
  if (local) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="stride-android.apk"',
        'Content-Length': String(local.size),
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ error: 'APK binary unavailable' }, { status: 404 });
}

export async function GET() {
  const externalUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL;
  if (externalUrl) {
    return NextResponse.redirect(externalUrl, 302);
  }

  const local = await resolveLocalApk();
  if (local) {
    return new NextResponse(Buffer.from(local.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="stride-android.apk"',
        'Content-Length': String(local.size),
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(
    { error: 'APK binary unavailable. Set NEXT_PUBLIC_APK_DOWNLOAD_URL or build app-release.apk locally.' },
    { status: 404 }
  );
}
