import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const fullApkPath = path.resolve(rootDir, 'app/build/app/outputs/flutter-apk/app-release.apk');
const liteApkPath = path.resolve(rootDir, 'app-lite/app/build/outputs/apk/release/app-release.apk');
const distDir = path.resolve(__dirname, '..', 'dist');
const chunksDir = path.resolve(distDir, 'chunks');

function packVariant(prefix, srcPath, downloadFilename) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Release APK not found at ${srcPath}`);
  }
  const buffer = fs.readFileSync(srcPath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const chunkSize = 18 * 1024 * 1024;
  const parts = [];

  for (let offset = 0, idx = 0; offset < buffer.length; offset += chunkSize, idx++) {
    const end = Math.min(offset + chunkSize, buffer.length);
    const partName = `/chunks/${prefix}-${idx}.bin`;
    fs.writeFileSync(path.join(chunksDir, `${prefix}-${idx}.bin`), buffer.subarray(offset, end));
    parts.push(partName);
  }
  return { filename: downloadFilename, size: buffer.length, sha256, parts };
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(chunksDir, { recursive: true });

const full = packVariant('full', fullApkPath, 'stride-android.apk');
const lite = packVariant('lite', liteApkPath, 'stride-lite-android.apk');

const manifest = {
  ...full,
  full,
  lite,
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `Prepared full (${full.parts.length} chunks, ${full.size} bytes, sha256=${full.sha256}) & ` +
    `lite (${lite.parts.length} chunks, ${lite.size} bytes, sha256=${lite.sha256})`
);
