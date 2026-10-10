// Dependency-free PNG icons generated from the same simple geometry as icon.svg.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function lineDistance(x, y, x1, y1, x2, y2) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) /
        ((x2 - x1) ** 2 + (y2 - y1) ** 2),
    ),
  );
  return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
}
function icon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const px = ((x + (sx + 0.5) / 2) * 192) / size;
          const py = ((y + (sy + 0.5) / 2) * 192) / size;
          const distance = Math.hypot(px - 96, py - 96);
          const angle = Math.atan2(py - 96, px - 96);
          if (
            (Math.abs(distance - 47) < 6.5 &&
              (angle > -0.58 || angle < -1.15)) ||
            lineDistance(px, py, 111, 70, 136, 70) < 6.5 ||
            lineDistance(px, py, 136, 70, 136, 45) < 6.5 ||
            distance < 8
          )
            coverage++;
        }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const blend = coverage / 4;
      raw[i] = Math.round(116 + (255 - 116) * blend);
      raw[i + 1] = Math.round(97 + (255 - 97) * blend);
      raw[i + 2] = Math.round(207 + (255 - 207) * blend);
      raw[i + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
await mkdir('public/icons', { recursive: true });
for (const size of [192, 512])
  await writeFile(`public/icons/icon-${size}.png`, icon(size));
