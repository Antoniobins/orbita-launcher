const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { ProjectManager, supportsHotReload } = require('../src/projects.cjs');
const windows = process.platform === 'win32';
const quote = text => windows ? '"' + text + '"' : "'" + text.replace(/'/g, "'\\''") + "'";
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita test-'));
  const manager = new ProjectManager(path.join(dir, 'projects.json'), { killDelay: 150 });
  t.after(async () => { await manager.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(dir, 'fixture.cjs'), 'console.log("hello orbita");setInterval(()=>{},1000)');
  const project = manager.save({ name: 'Teste', path: dir, command: `${quote(process.execPath)} fixture.cjs`, group: 'Testes' });
  return { manager, project, dir };
}
async function until(check) {
  const end = Date.now() + 8000;
  while (!check()) { if (Date.now() > end) throw new Error('Tempo esgotado'); await new Promise(resolve => setTimeout(resolve, 25)); }
}
test('salva e reabre cadastros, favoritos e exclusões sem apagar a pasta', t => {
  const { manager, project, dir } = fixture(t);
  manager.favorite(project.id);
  const restored = new ProjectManager(manager.file);
  assert.equal(restored.get(project.id).favorite, true);
  manager.remove(project.id);
  assert.equal(manager.list().length, 0);
  assert.ok(fs.existsSync(dir));
});
test('importa cadastros locais com identificadores preexistentes', t => {
  const { manager, dir } = fixture(t);
  const saved = manager.save({ id: 'imported-local', name: 'Importado', group: 'Local', path: dir, command: 'echo teste' });
  assert.equal(saved.id, 'imported-local');
  assert.equal(new ProjectManager(manager.file).get(saved.id).name, 'Importado');
});

test('preserva catálogo e backup quando a pasta redirecionada impede rename', t => {
  const { manager, project } = fixture(t);
  t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('redirected folder'), { code: 'EXDEV' }); });
  manager.favorite(project.id);
  assert.equal(new ProjectManager(manager.file).get(project.id).favorite, true);
  assert.equal(JSON.parse(fs.readFileSync(manager.file + '.bak', 'utf8'))[0].favorite, false);
  assert.equal(fs.existsSync(manager.file + '.tmp'), false);
});
test('inicia uma vez, captura logs e encerra o processo', async t => {
  const { manager, project } = fixture(t);
  await Promise.all([manager.start(project.id), manager.start(project.id)]);
  await until(() => manager.state(project.id).status === 'running' && manager.state(project.id).logs.includes('\nhello orbita\n'));
  assert.equal(manager.processes.size, 1);
  assert.equal(manager.state(project.id).status, 'running');
  assert.throws(() => manager.remove(project.id), /Pare o projeto/);
  assert.throws(() => manager.save(project), /Pare o projeto/);
  const pid = manager.processes.get(project.id).child.pid;
  await manager.stop(project.id);
  assert.equal(manager.state(project.id).status, 'stopped');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('detecta porta ocupada sem executar o comando', async t => {
  const { manager, project } = fixture(t);
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  manager.save({ ...project, url: `http://localhost:${server.address().port}` });
  await assert.rejects(manager.start(project.id), /já está em uso/);
  assert.equal(manager.processes.size, 0);
  assert.equal(manager.state(project.id).status, 'error');
});
test('expõe erro do comando e permite iniciar novamente', async t => {
  const { manager, project } = fixture(t);
  manager.save({ ...project, command: 'exit 23' });
  await manager.start(project.id);
  await until(() => manager.state(project.id).status === 'error');
  assert.match(manager.state(project.id).error, /código 23/);
  manager.save({ ...project, command: 'echo recuperado' });
  await manager.start(project.id);
  await until(() => manager.state(project.id).status === 'stopped');
  assert.match(manager.state(project.id).logs, /recuperado/);
});
test('encerra também subprocessos que ignoram SIGTERM', async t => {
  const { manager, project, dir } = fixture(t);
  const pidFile = path.join(dir, 'child.pid');
  fs.writeFileSync(path.join(dir, 'child.cjs'), `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  fs.writeFileSync(path.join(dir, 'parent.cjs'), `require('child_process').spawn(process.execPath, ['child.cjs'], {stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  manager.save({ ...project, command: `${quote(process.execPath)} parent.cjs` });
  await manager.start(project.id);
  await until(() => fs.existsSync(pidFile));
  const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
  await manager.shutdown();
  await until(() => { try { process.kill(childPid, 0); return false; } catch { return true; } });
  assert.equal(manager.processes.size, 0);
});
test('não sobrescreve um catálogo danificado', t => {
  const { manager } = fixture(t);
  fs.writeFileSync(manager.file, 'broken');
  assert.throws(() => new ProjectManager(manager.file));
  assert.equal(fs.readFileSync(manager.file, 'utf8'), 'broken');
});
test('hot reload envia r ao processo Flutter sem reiniciar o PID', async t => {
  const { manager, project, dir } = fixture(t);
  fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: fixture\n');
  const flutterFile = path.join(dir, windows ? 'flutter.bat' : 'flutter');
  fs.writeFileSync(flutterFile, windows ? `@echo off\r\n${quote(process.execPath)} ${quote(path.join(dir, 'flutter-fixture.cjs'))}\r\n` : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(dir, 'flutter-fixture.cjs'))}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'flutter-fixture.cjs'), `console.log('r Hot reload.'); setTimeout(() => console.log('Starting application from main method in: fixture'), 400); process.stdin.setEncoding('utf8'); process.stdin.on('data', value => { if(value.trim()==='r') console.log('Reloaded fixture'); });`);
  manager.save({ ...project, command: `${quote(flutterFile)} run -d chrome` });
  await assert.rejects(manager.hotReload(project.id), /Inicie o projeto/);
  await manager.start(project.id);
  await until(() => manager.state(project.id).logs.includes('r Hot reload.'));
  assert.equal(manager.state(project.id).hotReloadReady, false);
  await until(() => manager.state(project.id).hotReloadReady && manager.state(project.id).status === 'running');
  const pid = manager.processes.get(project.id).child.pid;
  await manager.hotReload(project.id);
  await until(() => manager.state(project.id).logs.includes('Reloaded fixture'));
  assert.equal(manager.processes.get(project.id).child.pid, pid);
  await assert.rejects(manager.hotReload(project.id), /Aguarde um instante/);
  await manager.stop(project.id);
  assert.equal(manager.state(project.id).hotReloadReady, false);
});
test('hot reload exige Flutter debug e aguarda inicialização', async t => {
  const { manager, project, dir } = fixture(t);
  fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: fixture\n');
  assert.equal(supportsHotReload({ ...project, command: 'flutter run --release' }), false);
  assert.equal(supportsHotReload({ ...project, command: 'flutter run --machine' }), false);
  await assert.rejects(manager.hotReload(project.id), /flutter run/);
  const flutterFile = path.join(dir, windows ? 'flutter.bat' : 'flutter');
  fs.writeFileSync(flutterFile, windows ? `@echo off\r\n${quote(process.execPath)} fixture.cjs\r\n` : '#!/bin/sh\nexec sleep 60\n', { mode: 0o755 });
  manager.save({ ...project, command: `${quote(flutterFile)} run` });
  await manager.start(project.id);
  await until(() => manager.state(project.id).status === 'running');
  await assert.rejects(manager.hotReload(project.id), /terminar a inicialização/);
});
