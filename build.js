const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const root = __dirname;
const partsDir = path.join(root, 'build-parts');
const outputDir = path.join(root, 'dist');
const outputFile = path.join(outputDir, 'index.html');

const partFiles = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (partFiles.length !== 7) {
  throw new Error(`Expected 7 dashboard parts, found ${partFiles.length}`);
}

const encoded = partFiles
  .map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8'))
  .join('')
  .replace(/\s/g, '');

const html = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');

if (!html.includes('<!doctype html>') || !html.includes('Night Shift')) {
  throw new Error('Rebuilt dashboard is incomplete');
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, html, 'utf8');

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
console.log(`Built ${outputFile}`);
console.log(`Size: ${Buffer.byteLength(html)} bytes`);
console.log(`SHA-256: ${sha256}`);
