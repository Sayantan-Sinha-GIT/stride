import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const apkPath = path.resolve(rootDir, 'app/build/app/outputs/flutter-apk/app-release.apk');
const distDir = path.resolve(__dirname, '..', 'dist');
const chunksDir = path.resolve(distDir, 'chunks');

if (!fs.existsSync(apkPath)) {
  throw new Error(`Release APK not found at ${apkPath}`);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(chunksDir, { recursive: true });

const buffer = fs.readFileSync(apkPath);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
const chunkSize = 18 * 1024 * 1024; // 18 MiB (< 25 MiB Cloudflare Workers Static Assets limit)
const parts = [];

for (let offset = 0, idx = 0; offset < buffer.length; offset += chunkSize, idx++) {
  const end = Math.min(offset + chunkSize, buffer.length);
  const partName = `/chunks/part-${idx}.bin`;
  fs.writeFileSync(path.join(chunksDir, `part-${idx}.bin`), buffer.subarray(offset, end));
  parts.push(partName);
}

const manifest = {
  filename: 'stride-android.apk',
  size: buffer.length,
  sha256,
  parts,
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${parts.length} chunks (${buffer.length} bytes, sha256=${sha256})`);
