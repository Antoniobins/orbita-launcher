import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Esta beta gera pacotes apenas no Windows e macOS.');
const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'orbita-package-'));
try {
  // Explicit allowlist: never bundle local catalogs, credentials, logs or Git history.
  for (const entry of ['src', 'assets', 'package.json', 'LICENSE', 'README.md']) {
    await fs.cp(path.join(root, entry), path.join(staging, entry), { recursive: true });
  }
  const paths = await packager({
    dir: staging, name: 'Orbita', platform: process.platform, arch: process.arch,
    electronVersion: pkg.devDependencies.electron, out: path.join(root, 'dist', 'v' + pkg.version),
    asar: true, prune: false, overwrite: false, appBundleId: 'dev.antoniobins.orbita',
    icon: path.join(root, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico')
  });
  console.log('Pacote sem assinatura:', paths.join('\n'));
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
