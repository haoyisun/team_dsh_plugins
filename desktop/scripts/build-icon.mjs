import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '..', 'bin');

const svgCode = `
<svg width="256" height="256" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="icon-edge" x1="3" y1="2" x2="21" y2="18" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8FAFC"/>
      <stop offset="0.22" stop-color="#CBD5E1"/>
      <stop offset="0.5" stop-color="#64748B"/>
      <stop offset="0.76" stop-color="#1E293B"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <!-- 原版 DSH Fish Logo SVG Path，使用银灰至深黑渐变轮廓适配明暗任务栏 -->
  <g transform="translate(1.68, 4.28) scale(0.9)">
    <path fill="#374151" stroke="url(#icon-edge)" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke fill" d="M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z"/>
  </g>
</svg>
`;

const traySvgCode = svgCode
  .replace(
    'fill="#374151" stroke="url(#icon-edge)" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke fill"',
    'fill="#2563EB"',
  )
  .replace(
    'transform="translate(1.68, 4.28) scale(0.9)"',
    'transform="translate(0.42, 3.48)"',
  );

const APP_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const TRAY_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64];

function createBmpIcon({ data, info }) {
  const size = info.width;
  const xorSize = size * size * 4;
  const andRowBytes = ((size + 31) >> 5) << 2;
  const andSize = andRowBytes * size;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(xorSize + andSize, 20);

  const xor = Buffer.alloc(xorSize);
  const andMask = Buffer.alloc(andSize);
  for (let y = 0; y < size; y += 1) {
    const sourceY = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const source = (sourceY * size + x) * 4;
      const dest = (y * size + x) * 4;
      xor[dest] = data[source + 2];
      xor[dest + 1] = data[source + 1];
      xor[dest + 2] = data[source];
      xor[dest + 3] = data[source + 3];
      if (data[source + 3] < 128) {
        andMask[y * andRowBytes + (x >> 3)] |= 1 << (7 - (x % 8));
      }
    }
  }
  return Buffer.concat([header, xor, andMask]);
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directorySize = images.length * 16;
  const directory = Buffer.alloc(directorySize);
  let offset = 6 + directorySize;
  const payloads = [];

  for (let index = 0; index < images.length; index += 1) {
    const { size, data } = images[index];
    const width = size === 256 ? 0 : size;
    directory.writeUInt8(width, index * 16);
    directory.writeUInt8(width, index * 16 + 1);
    directory.writeUInt16LE(1, index * 16 + 4);
    directory.writeUInt16LE(32, index * 16 + 6);
    directory.writeUInt32LE(data.length, index * 16 + 8);
    directory.writeUInt32LE(offset, index * 16 + 12);
    payloads.push(data);
    offset += data.length;
  }

  return Buffer.concat([header, directory, ...payloads]);
}

async function rasterPng(svg, size) {
  return sharp(Buffer.from(svg))
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function rasterBmp(svg, size) {
  const raw = await sharp(Buffer.from(svg))
    .resize(size, size, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return createBmpIcon(raw);
}

async function build() {
  await mkdir(outputDirectory, { recursive: true });

  const appImages = [];
  let png256;
  for (const size of APP_ICON_SIZES) {
    if (size === 256) {
      png256 = await rasterPng(svgCode, size);
      appImages.push({ size, data: png256 });
      continue;
    }
    appImages.push({ size, data: await rasterBmp(svgCode, size) });
  }

  const trayImages = [];
  let trayPng16;
  for (const size of TRAY_ICON_SIZES) {
    const data = await rasterBmp(traySvgCode, size);
    trayImages.push({ size, data });
    if (size === 16) {
      trayPng16 = await rasterPng(traySvgCode, size);
    }
  }

  await Promise.all([
    writeFile(path.join(outputDirectory, 'app-icon.png'), png256),
    writeFile(path.join(outputDirectory, 'app-icon.ico'), createIco(appImages)),
    writeFile(path.join(outputDirectory, 'tray-icon.png'), trayPng16),
    writeFile(
      path.join(outputDirectory, 'tray-icon.ico'),
      createIco(trayImages),
    ),
  ]);

  console.log('Built Windows app and tray icons using SVG & Sharp.');
}

await build();
