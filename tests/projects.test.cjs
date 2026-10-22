const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { ProjectManager } = require('../src/projects.cjs');
const quote = text => "'" + text.replace(/'/g, "'\\''") + "'";
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-test-'));
  const manager = new ProjectManager(path.join(dir, 'projects.json'), { killDelay: 150 });
  t.after(async () => { await manager.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = manager.save({ name: 'Teste', path: dir, command: `${quote(process.execPath)} -e 'console.log("hello orbita");setInterval(()=>{},1000)'`, group: 'Testes' });
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
