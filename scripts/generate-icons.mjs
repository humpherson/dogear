import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const publicDir = new URL('../public/', import.meta.url);
const sourceLogo = await readFile(
  new URL('dogeard-logo.svg', publicDir),
  'utf8',
);
const logo = sourceLogo.replace(/<path\b[^>]*>/g, (path) =>
  path.replace(/\b(fill|stroke)="(?!none\b)[^"]*"/g, '$1="#FFFFFF"'),
);
const viewBox = logo
  .match(/viewBox="([^"]+)"/)?.[1]
  .split(/\s+/)
  .map(Number);
if (!viewBox || viewBox.length !== 4)
  throw new Error('The logo needs a viewBox.');
function circularIcon(width) {
  const height = (width * viewBox[3]) / viewBox[2];
  const inset = logo.replace(
    '<svg ',
    `<svg x="${(512 - width) / 2}" y="${(512 - height) / 2}" width="${width}" height="${height}" `,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Dog-eard</title><rect width="512" height="512" rx="256" fill="#203b35"/>${inset}</svg>\n`;
}

// A 352px-wide mark fits wholly inside the maskable icon's central safe circle.
const icon = circularIcon(448);
const maskable = circularIcon(352);
await writeFile(new URL('favicon.svg', publicDir), icon);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  async function render(svg, size) {
    return page.evaluate(
      async ({ svg, size }) => {
        const image = new globalThis.Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas rendering is unavailable.');
        context.drawImage(image, 0, 0, size, size);
        return {
          png: canvas.toDataURL('image/png').split(',')[1],
          rgba: Array.from(context.getImageData(0, 0, size, size).data),
        };
      },
      { svg, size },
    );
  }
  for (const [name, size, source] of [
    ['favicon-16x16.png', 16, icon],
    ['favicon-32x32.png', 32, icon],
    ['favicon-96x96.png', 96, icon],
    ['apple-touch-icon.png', 180, icon],
    ['web-app-manifest-192x192.png', 192, icon],
    ['web-app-manifest-512x512.png', 512, icon],
    ['web-app-manifest-maskable-512x512.png', 512, maskable],
  ]) {
    const result = await render(source, size);
    await writeFile(
      new URL(name, publicDir),
      Buffer.from(result.png, 'base64'),
    );
  }

  // Classic ICO with real 32-bit bitmap frames and transparency masks, rather
  // than a renamed PNG. No additional image-conversion dependency is needed.
  const frames = [];
  for (const size of [16, 32, 48]) {
    const { rgba } = await render(icon, size);
    const pixels = Buffer.alloc(size * size * 4);
    const maskStride = Math.ceil(size / 32) * 4;
    const mask = Buffer.alloc(maskStride * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = (y * size + x) * 4;
        const to = ((size - 1 - y) * size + x) * 4;
        pixels[to] = rgba[from + 2];
        pixels[to + 1] = rgba[from + 1];
        pixels[to + 2] = rgba[from];
        pixels[to + 3] = rgba[from + 3];
        if (rgba[from + 3] < 128)
          mask[(size - 1 - y) * maskStride + (x >> 3)] |= 128 >> (x % 8);
      }
    }
    const dib = Buffer.alloc(40);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(size, 4);
    dib.writeInt32LE(size * 2, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    dib.writeUInt32LE(pixels.length, 20);
    frames.push({ size, data: Buffer.concat([dib, pixels, mask]) });
  }
  const directory = Buffer.alloc(6 + frames.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  await writeFile(
    new URL('favicon.ico', publicDir),
    Buffer.concat([directory, ...frames.map(({ data }) => data)]),
  );
  console.log(
    `Generated SVG, PNG, Apple and ICO icons in ${fileURLToPath(publicDir)}`,
  );
} finally {
  await browser.close();
}
