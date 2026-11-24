import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function resolveLocalApk(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-release.apk'),
    path.resolve(process.cwd(), 'app/build/app/outputs/flutter-apk/app-release.apk'),
    path.resolve(process.cwd(), '../app/build/app/outputs/flutter-apk/app-debug.apk'),
    path.resolve(process.cwd(), 'app/build/app/outputs/flutter-apk/app-debug.apk'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

export async function HEAD() {
  const found = resolveLocalApk();
  if (found) {
    const stat = fs.statSync(found);
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="stride-android.apk"',
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      },
    });
  }
  const externalUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL;
  if (externalUrl) {
    return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'APK binary unavailable' }, { status: 404 });
}

export async function GET() {
  const found = resolveLocalApk();
  if (found) {
    const stat = fs.statSync(found);
    const buffer = fs.readFileSync(found);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="stride-android.apk"',
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      },
    });
  }

  const externalUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL;
  if (externalUrl) {
    return NextResponse.redirect(externalUrl, 302);
  }

  return NextResponse.json(
    { error: 'APK binary has not been compiled yet in app/build/app/outputs/flutter-apk.' },
    { status: 404 }
  );
}
