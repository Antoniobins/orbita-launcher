const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{40,}\b/,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/
];
let checked = 0;
const findings = [];
function scan(label, content) {
  checked++;
  if (content.includes(0)) return; // Binary assets are inspected by filename.
  const text = content.toString('utf8');
  if (patterns.some(pattern => pattern.test(text))) findings.push(label + ': possível credencial');
}
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
for (const file of files) {
  if (/(^|\/)(?:data|screenshots|node_modules|dist|\.git)(\/|$)|(^|\/)\.env(?!\.example$)|\.(?:pem|key|p12|pfx|sqlite3?|db)$/i.test(file)) findings.push(file + ': arquivo privado/gerado');
  scan(file, fs.readFileSync(path.join(root, file)));
}
const objects = git('rev-list', '--objects', '--all').trim().split('\n').filter(Boolean).map(line => line.split(' ')[0]);
const batch = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: objects.join('\n') + '\n', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
if (batch.status !== 0) throw new Error('Não foi possível revisar os objetos do histórico.');
let offset = 0;
while (offset < batch.stdout.length) {
  const end = batch.stdout.indexOf(10, offset);
  const [id, type, sizeText] = batch.stdout.subarray(offset, end).toString().split(' ');
  const size = Number(sizeText); if (!Number.isFinite(size)) throw new Error('Objeto Git inválido.');
  offset = end + 1;
  if (type === 'blob') scan('histórico ' + id, batch.stdout.subarray(offset, offset + size));
  offset += size + 1;
}
async function main() {
  const asarFile = process.argv[2];
  if (asarFile) {
    const { listPackage, extractFile } = await import('@electron/asar');
    for (const rawEntry of listPackage(path.resolve(asarFile))) {
      const entry = rawEntry.replace(/\\/g, '/');
      if (!/^\/(?:src|assets)(?:\/|$)|^\/(?:package\.json|LICENSE|README\.md)$/.test(entry)) findings.push('Pacote contém arquivo inesperado: ' + entry);
    }
    const packaged = JSON.parse(extractFile(path.resolve(asarFile), 'package.json').toString());
    if (packaged.version !== require('../package.json').version) findings.push('Versão do pacote diverge da fonte.');
  }
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
  else console.log(`Revisão concluída: ${files.length} arquivos atuais, ${checked - files.length} blobs históricos; nenhum padrão de credencial detectado.${asarFile ? ' Pacote contém apenas arquivos permitidos.' : ''}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
