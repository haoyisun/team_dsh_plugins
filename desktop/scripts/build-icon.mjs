import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const size = 64;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '..', 'bin');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedSquare(x, y) {
  const radius = 14;
  const nearestX = Math.max(radius, Math.min(size - radius - 1, x));
  const nearestY = Math.max(radius, Math.min(size - radius - 1, y));
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

function insideLetterD(x, y) {
  if (x >= 18 && x <= 25 && y >= 14 && y <= 49) return true;
  const outer = ((x - 27) / 23) ** 2 + ((y - 31.5) / 18) ** 2 <= 1;
  const inner = ((x - 27) / 15) ** 2 + ((y - 31.5) / 10) ** 2 < 1;
  return x >= 25 && outer && !inner;
}

function createPng() {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4;
      const visible = insideRoundedSquare(x, y);
      const white = visible && insideLetterD(x, y);
      row[offset] = white ? 255 : 32;
      row[offset + 1] = white ? 255 : 33;
      row[offset + 2] = white ? 255 : 36;
      row[offset + 3] = visible ? 255 : 0;
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size;
  header[7] = size;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'app-icon.ico'), createIco(createPng()));
console.log('Built Windows app icon.');
