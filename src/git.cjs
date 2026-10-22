const fs = require('node:fs');
const { execFile } = require('node:child_process');

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/git', ['--literal-pathspecs', '-C', cwd, ...args], {
      encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', LC_ALL: 'C' }
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      let detail = (stderr || stdout || error.message).trim().replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[credencial]@');
      if (error.killed) detail = 'A operação excedeu dois minutos. Confira a conexão e tente novamente.';
      else if (/Authentication failed|could not read Username|Permission denied \(publickey\)/i.test(detail)) detail = 'O Git precisa de autenticação. Configure o acesso ao remoto no terminal e tente novamente.';
      else if (/non-fast-forward|fetch first|Not possible to fast-forward|divergent/i.test(detail)) detail = 'As branches têm históricos diferentes. Atualize e resolva a divergência no editor antes de continuar.';
      reject(new Error(detail.slice(-6000)));
    });
  });
}
async function optional(cwd, args) { try { return (await git(cwd, args)).trim(); } catch { return ''; } }
function parseChanges(text) {
  const entries = text.split('\0'), files = [];
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    const status = entries[i].slice(0, 2), file = entries[i].slice(3);
    const oldPath = /R|C/.test(status) ? entries[++i] : null;
    files.push({ path: file, oldPath, status, conflict: ['DD','AU','UD','UA','DU','AA','UU'].includes(status) });
  }
  return files;
}
class GitService {
  constructor() { this.locks = new Set(); this.pending = new Set(); this.closing = false; }
  async inspect(cwd) {
    let root;
    try { root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim(); }
    catch { return { available: false, reason: 'Esta pasta não tem um repositório Git acessível.' }; }
    const branch = await optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const files = parseChanges(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    const remotes = (await git(root, ['remote'])).trim().split('\n').filter(Boolean);
    const upstream = await optional(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    const trackingRemote = branch ? await optional(root, ['config', '--get', `branch.${branch}.remote`]) : '';
    const trackingRef = branch ? await optional(root, ['config', '--get', `branch.${branch}.merge`]) : '';
    const remote = remotes.includes(trackingRemote) ? trackingRemote : remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : '';
    const targetBranch = remote === trackingRemote && trackingRef.startsWith('refs/heads/') ? trackingRef.slice(11) : branch;
    let ahead = 0, behind = 0;
    if (upstream) {
      const counts = (await optional(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).split(/\s+/);
      ahead = Number(counts[0]) || 0; behind = Number(counts[1]) || 0;
    }
    let operation = false;
    for (const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']) {
      const file = (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', marker])).trim();
      if (fs.existsSync(file)) operation = true;
    }
    return { available: true, root, branch, remote, targetBranch, upstream, ahead, behind, files, operation, busy: this.locks.has(root), head: await optional(root, ['rev-parse', '--verify', 'HEAD']) };
  }
  run(cwd, action, input = {}) {
    if (this.closing) return Promise.reject(new Error('O aplicativo está encerrando.'));
    const task = this.perform(cwd, action, input);
    this.pending.add(task);
    task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }
  async shutdown() { this.closing = true; await Promise.allSettled([...this.pending]); }
  async perform(cwd, action, input) {
    const state = await this.inspect(cwd);
    if (!state.available) throw new Error(state.reason);
    if (this.locks.has(state.root)) throw new Error('Já existe uma operação Git neste repositório. Aguarde.');
    this.locks.add(state.root);
    let committed = false;
    try {
      if (!state.branch) throw new Error('O repositório está sem branch ativa (detached HEAD). Escolha uma branch no editor.');
      if (!state.remote) throw new Error('Configure um remoto origin ou uma branch com upstream no terminal.');
      if (state.operation || state.files.some(f => f.conflict)) throw new Error('Conclua o merge, rebase ou resolução de conflitos no editor antes de continuar.');
      if (action === 'pull') {
        if (state.files.length) throw new Error('Há alterações locais. Faça commit ou guarde suas alterações antes de puxar.');
        await git(state.root, ['pull', '--ff-only', '--no-rebase', '--', state.remote, state.targetBranch]);
        return { message: `Branch ${state.branch} atualizada.`, state: await this.inspect(cwd) };
      }
      if (action !== 'publish') throw new Error('Operação inválida.');
      if (input.branch !== state.branch || input.head !== state.head || input.remote !== state.remote || input.targetBranch !== state.targetBranch) throw new Error('A branch ou o destino mudou. Feche esta janela e abra Publicar novamente.');
      if (!Array.isArray(input.files) || input.files.some(f => typeof f !== 'string')) throw new Error('Seleção de arquivos inválida.');
      const selected = [...new Set(input.files)];
      const current = new Map(state.files.map(f => [f.path, f]));
      if (selected.some(file => !current.has(file))) throw new Error('Os arquivos mudaram. Revise a lista antes de publicar.');
      if (selected.length) {
        const message = String(input.message || '').trim();
        if (!message) throw new Error('Escreva uma mensagem para o commit.');
        const paths = [...new Set(selected.flatMap(file => [file, current.get(file).oldPath].filter(Boolean)))];
        if (paths.length > 1000) throw new Error('Selecione até 1.000 arquivos por commit.');
        // Renamed source paths are already removed from the index by Git.
        // Stage destinations, then include both sides in the selective commit.
        await git(state.root, ['add', '--all', '--', ...selected]);
        // Commit only the reviewed paths, preserving unrelated staged changes.
        await git(state.root, ['commit', '--only', '-m', message, '--', ...paths]);
        committed = true;
      }
      const branch = await optional(state.root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      if (branch !== state.branch) throw new Error('A branch mudou durante a operação. Confira o repositório no editor.');
      await git(state.root, ['push', '--set-upstream', '--', state.remote, `HEAD:refs/heads/${state.targetBranch}`]);
      return { message: `Publicado em ${state.remote}/${state.targetBranch}.`, state: await this.inspect(cwd) };
    } catch (error) {
      if (committed) throw new Error(`O commit foi salvo localmente, mas a publicação não terminou. Você pode tentar publicar novamente sem criar outro commit.\n${error.message}`);
      throw error;
    } finally { this.locks.delete(state.root); }
  }
}
module.exports = { GitService, parseChanges };
