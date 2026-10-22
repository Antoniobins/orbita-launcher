const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'dist', 'v' + version);
const folder = path.join(base, `Orbita-${process.platform}-${process.arch}`);
const name = `Orbita-${version}-${process.platform}-${process.arch}.zip`;
const output = path.join(base, name);
if (fs.existsSync(output)) throw new Error('O arquivo de distribuição já existe: ' + output);
if (process.platform === 'win32') {
  const literal = s => "'" + s.replace(/'/g, "''") + "'";
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath ${literal(folder)} -DestinationPath ${literal(output)}`], { stdio: 'inherit', windowsHide: true });
} else if (process.platform === 'darwin') {
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', folder, output], { stdio: 'inherit' });
} else throw new Error('Plataforma sem pacote beta.');
const hash = createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(output + '.sha256', `${hash}  ${name}\n`);
console.log(output);
