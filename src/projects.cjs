const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

function validateProject(input) {
  const project = {};
  for (const key of ['name', 'group', 'path', 'command', 'url', 'description']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error('Cadastro inválido.');
    project[key] = (input[key] || '').trim();
  }
  if (!project.name || !project.path || !project.command) throw new Error('Preencha nome, pasta e comando.');
  if (project.path.startsWith('~/')) project.path = path.join(os.homedir(), project.path.slice(2));
  if (!path.isAbsolute(project.path) || !fs.statSync(project.path).isDirectory()) throw new Error('Escolha uma pasta existente.');
  if (project.url) {
    const url = new URL(project.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use uma URL http ou https.');
  }
  project.group ||= 'Pessoais';
  project.favorite = Boolean(input.favorite);
  project.id = input.id || randomUUID();
  return project;
}

function portAvailable(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });
}

class ProjectManager extends EventEmitter {
  constructor(file, options = {}) {
    super();
    this.file = file;
    this.killDelay = options.killDelay || 3000;
    this.processes = new Map();
    this.runtime = new Map();
    this.closing = false;
    if (fs.existsSync(file)) {
      // Fail visibly instead of silently overwriting a damaged catalog.
      this.projects = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(this.projects)) throw new Error('O catálogo não contém uma lista de projetos.');
    } else this.projects = [];
  }
  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.projects, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  state(id) {
    return this.runtime.get(id) || { status: 'stopped', logs: '', startedAt: null, error: '' };
  }
  list() { return this.projects.map(p => ({ ...p, ...this.state(p.id) })); }
  get(id) {
    const p = this.projects.find(p => p.id === id);
    if (!p) throw new Error('Projeto não encontrado.');
    return p;
  }
  update(id, patch) {
    this.runtime.set(id, { ...this.state(id), ...patch });
    this.emit('change', this.list());
  }
  log(id, chunk) {
    // Strip terminal escape sequences, cap retained output.
    const clean = String(chunk).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    this.update(id, { logs: (this.state(id).logs + clean).slice(-100000) });
  }
  save(input) {
    if (input.id && this.projects.some(p => p.id === input.id) && ['running', 'starting', 'stopping'].includes(this.state(input.id).status)) {
      throw new Error('Pare o projeto antes de editar.');
    }
    const project = validateProject(input);
    const index = this.projects.findIndex(p => p.id === project.id);
    if (index < 0) this.projects.push(project); else this.projects[index] = project;
    this.persist();
    this.emit('change', this.list());
    return project;
  }
  favorite(id) {
    const project = this.get(id);
    project.favorite = !project.favorite;
    this.persist();
    this.emit('change', this.list());
  }
  remove(id) {
    this.get(id);
    if (this.processes.has(id)) throw new Error('Pare o projeto antes de remover.');
    this.projects = this.projects.filter(p => p.id !== id);
    this.persist();
    this.emit('change', this.list());
  }
  async start(id) {
    if (this.closing) throw new Error('O aplicativo está encerrando.');
    const p = this.get(id);
    if (this.processes.has(id) || ['starting', 'stopping'].includes(this.state(id).status)) return;
    validateProject(p);
    this.update(id, { status: 'starting', error: '', logs: '', startedAt: Date.now() });
    try {
      if (p.url) {
        const url = new URL(p.url);
        if (['localhost', '127.0.0.1'].includes(url.hostname)) {
          const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
          if (!(await portAvailable(port))) throw new Error(`A porta ${port} já está em uso. Pare o outro serviço ou altere a porta e o comando do projeto.`);
        }
      }
      if (this.closing) throw new Error('O aplicativo está encerrando.');
      const child = spawn('/bin/zsh', ['-lc', p.command], {
        cwd: p.path, detached: true,
        env: { ...process.env, TERM: 'dumb', NO_COLOR: '1', PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const record = { child, timer: null, done: null };
      record.done = new Promise(resolve => { record.resolve = resolve; });
      this.processes.set(id, record);
      this.log(id, `$ ${p.command}\n\n`);
      child.stdout.on('data', chunk => this.log(id, chunk));
      child.stderr.on('data', chunk => this.log(id, chunk));
      child.once('spawn', () => this.update(id, { status: 'running' }));
      let finished = false;
      const finish = (code, signal, error) => {
        if (finished) return;
        finished = true;
        const stopping = this.state(id).status === 'stopping' || this.closing;
        // Shell commands may leave children alive after their parent exits.
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        clearTimeout(record.timer);
        this.processes.delete(id);
        const failed = !stopping && (error || code !== 0);
        const message = error?.message || (failed ? `O comando encerrou (${signal || `código ${code}`}). Confira os logs.` : '');
        this.log(id, `\n${stopping ? '■ Projeto parado.' : failed ? '✕ ' + message : '✓ Comando concluído.'}\n`);
        this.update(id, { status: failed ? 'error' : 'stopped', error: message, startedAt: null });
        record.resolve();
      };
      child.once('error', error => finish(null, null, error));
      child.once('close', finish);
    } catch (error) {
      this.update(id, { status: 'error', error: error.message, logs: error.message + '\n', startedAt: null });
      throw error;
    }
  }
  async stop(id) {
    const record = this.processes.get(id);
    if (!record) return;
    if (this.state(id).status === 'stopping') return record.done;
    this.update(id, { status: 'stopping' });
    try { process.kill(-record.child.pid, 'SIGTERM'); } catch {}
    record.timer = setTimeout(() => {
      try { process.kill(-record.child.pid, 'SIGKILL'); } catch {}
    }, this.killDelay);
    return record.done;
  }
  async shutdown() {
    this.closing = true;
    await Promise.all([...this.processes.keys()].map(id => this.stop(id)));
    while (this.list().some(p => p.status === 'starting')) await new Promise(resolve => setTimeout(resolve, 20));
  }
}
module.exports = { ProjectManager, validateProject, portAvailable };
