import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON_BASE64 = 'AAABAAEAAQEAAAEAIABDAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAABAAAAAQgEAAAAtRwMAgAAAAtJREFUeNpj/P8PAAIFAQHNarcAAAAASUVORK5CYII=';

const targetUrl = new URL('../public/favicon.ico', import.meta.url);
const targetPath = fileURLToPath(targetUrl);

await mkdir(dirname(targetPath), { recursive: true });
const iconBytes = Buffer.from(ICON_BASE64, 'base64');

let shouldWrite = true;

if (existsSync(targetPath)) {
  const currentBytes = await readFile(targetPath);
  if (currentBytes.equals(iconBytes)) {
    shouldWrite = false;
  }
}

if (shouldWrite) {
  await writeFile(targetPath, iconBytes);
  console.log('Generated public/favicon.ico');
}
