const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { GitService, parseChanges } = require('../src/git.cjs');
const git = (cwd, ...args) => execFileSync(process.platform === 'win32' ? 'git.exe' : '/usr/bin/git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-git-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git'), local = path.join(dir, 'local'), peer = path.join(dir, 'peer');
  git(dir, 'init', '--bare', '--initial-branch=main', remote);
  git(dir, 'clone', remote, local);
  git(local, 'config', 'user.name', 'Orbita Test'); git(local, 'config', 'user.email', 'orbita@example.invalid');
  fs.writeFileSync(path.join(local, 'app.txt'), 'original');
  fs.writeFileSync(path.join(local, 'other.txt'), 'original');
  git(local, 'add', '.'); git(local, 'commit', '-m', 'initial'); git(local, 'push', '-u', 'origin', 'main');
  git(dir, 'clone', remote, peer);
  git(peer, 'config', 'user.name', 'Orbita Test'); git(peer, 'config', 'user.email', 'orbita@example.invalid');
  return { dir, remote, local, peer, service: new GitService() };
}
function input(state, files = [], message = '') { return { branch: state.branch, head: state.head, remote: state.remote, targetBranch: state.targetBranch, files, message }; }
test('Git identifica branch, remoto e nomes de arquivos com espaços, renomeação e nova linha', () => {
  assert.deepEqual(parseChanges('R  novo nome.txt\0antigo.txt\0?? linha\nnova.txt\0').map(f => [f.path, f.oldPath]), [['novo nome.txt', 'antigo.txt'], ['linha\nnova.txt', null]]);
});
test('Git publica somente os arquivos selecionados, preservando outros arquivos staged', async t => {
  const { local, remote, service } = fixture(t);
  fs.writeFileSync(path.join(local, 'app.txt'), 'publicado');
  fs.writeFileSync(path.join(local, 'other.txt'), 'privado local');
  git(local, 'add', 'other.txt');
  const state = await service.inspect(local);
  assert.equal(state.branch, 'main'); assert.equal(state.remote, 'origin');
  const result = await service.run(local, 'publish', input(state, ['app.txt'], 'update selected'));
  assert.match(result.message, /origin\/main/);
  assert.equal(git(remote, 'show', 'main:app.txt'), 'publicado');
  assert.equal(git(remote, 'show', 'main:other.txt'), 'original');
  assert.equal(git(local, 'diff', '--cached', '--name-only'), 'other.txt');
});
test('Git puxa mudanças em fast-forward e bloqueia arquivos locais alterados', async t => {
  const { local, peer, service } = fixture(t);
  fs.writeFileSync(path.join(peer, 'app.txt'), 'remoto');
  git(peer, 'add', '.'); git(peer, 'commit', '-m', 'remote change'); git(peer, 'push');
  await service.run(local, 'pull');
  assert.equal(fs.readFileSync(path.join(local, 'app.txt'), 'utf8'), 'remoto');
  fs.writeFileSync(path.join(local, 'app.txt'), 'local');
  await assert.rejects(service.run(local, 'pull'), /alterações locais/);
  assert.equal(fs.readFileSync(path.join(local, 'app.txt'), 'utf8'), 'local');
});
test('Git publica branch nova e configura upstream sem trocar de branch', async t => {
  const { local, remote, service } = fixture(t);
  git(local, 'switch', '-c', 'feature/teste');
  fs.writeFileSync(path.join(local, 'novo arquivo.txt'), 'novo');
  const state = await service.inspect(local);
  assert.equal(state.upstream, '');
  await service.run(local, 'publish', input(state, ['novo arquivo.txt'], 'new branch'));
  assert.equal(git(remote, 'show', 'feature/teste:novo arquivo.txt'), 'novo');
  assert.equal(git(local, 'rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/feature/teste');
});
test('Git rejeita divergência sem force push e preserva o commit local', async t => {
  const { local, peer, remote, service } = fixture(t);
  fs.writeFileSync(path.join(peer, 'remote.txt'), 'remote'); git(peer, 'add', '.'); git(peer, 'commit', '-m', 'remote'); git(peer, 'push');
  const remoteHead = git(remote, 'rev-parse', 'main');
  fs.writeFileSync(path.join(local, 'local.txt'), 'local');
  const state = await service.inspect(local);
  await assert.rejects(service.run(local, 'publish', input(state, ['local.txt'], 'local commit')), /commit foi salvo localmente/);
  assert.equal(git(local, 'log', '-1', '--format=%s'), 'local commit');
  assert.equal(git(remote, 'rev-parse', 'main'), remoteHead);
  await assert.rejects(service.run(local, 'pull'), /históricos diferentes/);
  assert.equal(git(local, 'log', '-1', '--format=%s'), 'local commit');
});
test('Git impede publicar se a branch mudou desde a revisão', async t => {
  const { local, remote, service } = fixture(t);
  const state = await service.inspect(local), original = git(remote, 'rev-parse', 'main');
  git(local, 'switch', '-c', 'outra');
  await assert.rejects(service.run(local, 'publish', input(state)), /destino mudou/);
  assert.equal(git(remote, 'rev-parse', 'main'), original);
});
test('Git preserva o destino de tracking configurado e publica commits já feitos', async t => {
  const { local, remote, service } = fixture(t);
  git(local, 'branch', '-m', 'trabalho');
  fs.writeFileSync(path.join(local, 'app.txt'), 'commit existente'); git(local, 'add', '.'); git(local, 'commit', '-m', 'existing');
  const state = await service.inspect(local);
  assert.equal(state.branch, 'trabalho'); assert.equal(state.targetBranch, 'main');
  await service.run(local, 'publish', input(state));
  assert.equal(git(remote, 'show', 'main:app.txt'), 'commit existente');
});
test('Git publica renomeação e trata pathspecs como nomes literais', async t => {
  const { local, remote, service } = fixture(t);
  git(local, 'mv', 'app.txt', 'renomeado.txt');
  const literalName = process.platform === 'win32' ? '[literal].txt' : ':(glob)*.txt';
  fs.writeFileSync(path.join(local, literalName), 'literal');
  fs.writeFileSync(path.join(local, 'l.txt'), 'não selecionado');
  const state = await service.inspect(local);
  await service.run(local, 'publish', input(state, ['renomeado.txt', literalName], 'rename and literal'));
  assert.equal(git(remote, 'show', 'main:renomeado.txt'), 'original');
  assert.equal(git(remote, 'show', `main:${literalName}`), 'literal');
  assert.throws(() => git(remote, 'show', 'main:app.txt'));
  assert.throws(() => git(remote, 'show', 'main:l.txt'));
});
test('Git reconhece pasta sem repositório e HEAD destacado', async t => {
  const { dir, local, service } = fixture(t);
  assert.equal((await service.inspect(dir)).available, false);
  git(local, 'checkout', '--detach');
  await assert.rejects(service.run(local, 'pull'), /sem branch ativa/);
});
