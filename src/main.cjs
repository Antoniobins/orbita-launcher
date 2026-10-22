const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { ProjectManager } = require('./projects.cjs');
const { GitService } = require('./git.cjs');
const gitService = new GitService();

const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-smoke-')));
app.setName('Órbita');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let win, manager, quitting = false;
const entry = pathToFileURL(path.join(__dirname, 'ui/index.html')).href;

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

function handler(name, callback) {
  ipcMain.handle('orbita:' + name, (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame.url !== entry) throw new Error('Origem inválida.');
    return callback(...args);
  });
}

async function createWindow() {
  let smokeGitDir, smokeGitProject;
  if (smoke) {
    smokeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-ui-git-'));
    const local = path.join(smokeGitDir, 'local'), remote = path.join(smokeGitDir, 'remote.git');
    const run = (cwd, args) => require('node:child_process').execFileSync('/usr/bin/git', ['-C', cwd, ...args], { stdio: 'pipe' });
    run(smokeGitDir, ['init', '--bare', '--initial-branch=main', remote]);
    run(smokeGitDir, ['clone', remote, local]);
    run(local, ['config', 'user.name', 'Orbita UI Test']); run(local, ['config', 'user.email', 'orbita@example.invalid']);
    fs.writeFileSync(path.join(local, 'app.txt'), 'initial');
    run(local, ['add', '.']); run(local, ['commit', '-m', 'initial']); run(local, ['push', '-u', 'origin', 'main']);
    fs.writeFileSync(path.join(local, 'app.txt'), 'ui published');
    smokeGitProject = manager.save({ name: 'Orbita Git UI Test', path: local, group: 'Testes', command: 'echo teste' });
  }
  win = new BrowserWindow({
    width: 1380, height: 900, minWidth: 980, minHeight: 680,
    title: 'Órbita — seus projetos, em movimento', backgroundColor: '#f7f8fa',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 22, y: 23 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadURL(entry);
  win.on('closed', () => { win = null; });
  if (smoke) {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        await new Promise(r => setTimeout(r, 350));
        const waitFor = async check => { const until = Date.now() + 8000; while (!check()) { if (Date.now() > until) throw Error('Tempo esgotado na interface'); await new Promise(r => setTimeout(r, 40)); } };
        const gitCard = () => [...document.querySelectorAll('.project-card')].find(el => el.querySelector('h3').textContent === 'Orbita Git UI Test');
        await refreshGit(${JSON.stringify(smokeGitProject?.id)});
        await waitFor(() => gitCard() && !gitCard().querySelector('[data-action="git-publish"]').disabled);
        gitCard().querySelector('[data-action="git-publish"]').click();
        await waitFor(() => document.querySelector('#git-dialog').open);
        if (!document.querySelector('#git-target').textContent.includes('origin/main')) throw Error('Destino Git incorreto');
        document.querySelector('#git-files input').click();
        document.querySelector('#git-commit-message').value = 'ui selective commit';
        document.querySelector('#git-form').requestSubmit();
        await waitFor(() => !document.querySelector('#git-dialog').open);
        gitCard().querySelector('[data-action="git-pull"]').click();
        await waitFor(() => !gitCard().querySelector('[data-action="git-pull"]').disabled);
        gitCard().querySelector('[data-action="remove"]').click();
        document.querySelector('#confirm-remove').click();
        await waitFor(() => !gitCard());
        if (!document.querySelector('#new-project')) throw Error('Botão de cadastro ausente');
        document.querySelector('#new-project').click();
        if (!document.querySelector('#project-dialog').open) throw Error('Cadastro não abriu');
        const form = document.querySelector('#project-form');
        form.elements.name.value = 'Orbita UI Test';
        form.elements.group.value = 'Testes';
        form.elements.path.value = ${JSON.stringify(os.tmpdir())};
        form.elements.command.value = 'while true; do echo orbita-ui-ready; sleep 1; done';
        form.requestSubmit();
        await waitFor(() => !document.querySelector('#project-dialog').open);
        const findCard = () => [...document.querySelectorAll('.project-card')].find(el => el.querySelector('h3').textContent === 'Orbita UI Test');
        await waitFor(findCard);
        findCard().querySelector('[data-action="favorite"]').click();
        await waitFor(() => findCard().querySelector('[data-action="favorite"]').getAttribute('aria-pressed') === 'true');
        findCard().querySelector('[data-action="start"]').click();
        await waitFor(() => findCard().classList.contains('running'));
        findCard().querySelector('[data-action="logs"]').click();
        await waitFor(() => document.querySelector('#logs-output').textContent.includes('\\norbita-ui-ready\\n'));
        document.querySelector('#logs-dialog .close-dialog').click();
        findCard().querySelector('[data-action="stop"]').click();
        await waitFor(() => Boolean(findCard().querySelector('[data-action="start"]')));
        const search = document.querySelector('#search');
        search.value = 'Orbita UI Test'; search.dispatchEvent(new Event('input'));
        if (document.querySelectorAll('.project-card').length !== 1) throw Error('Busca falhou');
        search.value = ''; search.dispatchEvent(new Event('input'));
        findCard().querySelector('[data-action="remove"]').click();
        document.querySelector('#confirm-remove').click();
        await waitFor(() => !findCard());
        document.querySelector('#toast').hidden = true;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { title: document.title, cards: document.querySelectorAll('.project-card').length, bridge: typeof window.orbita.start };
      })()`);
      await new Promise(resolve => setTimeout(resolve, 250));
      const screenshotDir = app.isPackaged ? path.join(app.getPath('userData'), 'screenshots') : path.join(__dirname, '../screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      fs.writeFileSync(path.join(screenshotDir, 'orbita.png'), (await win.webContents.capturePage()).toPNG());
      console.log('SMOKE_OK', JSON.stringify(result));
      const published = require('node:child_process').execFileSync('/usr/bin/git', ['-C', path.join(smokeGitDir, 'remote.git'), 'show', 'main:app.txt'], { encoding: 'utf8' });
      if (published !== 'ui published') throw new Error('A publicação da interface não chegou ao remoto temporário.');
      fs.rmSync(smokeGitDir, { recursive: true, force: true });
      console.log('GIT_UI_OK publish + pull via temporary local remote');
      app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  }
}

if (locked) app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  try { manager = new ProjectManager(path.join(app.getPath('userData'), 'projects.json')); }
  catch (error) { dialog.showErrorBox('Não foi possível abrir seu catálogo', error.message); app.exit(1); return; }
  manager.on('change', projects => { if (win && !win.isDestroyed()) win.webContents.send('projects', projects); });
  const importIndex = process.argv.indexOf('--import-local');
  if (importIndex >= 0) {
    const file = process.argv[importIndex + 1];
    try {
      const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(catalog)) throw new Error('Formato de catálogo inválido.');
      for (const project of catalog) if (!manager.projects.some(p => p.path === project.path)) manager.save(project);
      console.log('LOCAL_CATALOG', manager.projects.length, app.getPath('userData'));
    } catch (error) { dialog.showErrorBox('Não foi possível importar', error.message); app.exit(1); return; }
  }
  handler('list', () => manager.list());
  handler('save', input => manager.save(input));
  handler('start', id => manager.start(id));
  handler('stop', id => manager.stop(id));
  handler('remove', id => manager.remove(id));
  handler('favorite', id => manager.favorite(id));
  handler('gitStatus', id => gitService.inspect(manager.get(id).path));
  handler('gitPull', id => gitService.run(manager.get(id).path, 'pull'));
  handler('gitPublish', (id, input) => gitService.run(manager.get(id).path, 'publish', input));
  handler('chooseFolder', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Selecione a pasta do projeto', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handler('open', async id => {
    const project = manager.get(id);
    if (!project.url) throw new Error('Cadastre a URL do projeto primeiro.');
    const url = new URL(project.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.');
    await shell.openExternal(url.href);
  });
  handler('folder', async id => {
    const error = await shell.openPath(manager.get(id).path);
    if (error) throw new Error(error);
  });
  handler('editor', async id => {
    const project = manager.get(id);
    const url = new URL('vscode://file' + project.path.split('/').map(encodeURIComponent).join('/'));
    await shell.openExternal(url.href);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Órbita', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Janela', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }] }
  ]));
  await createWindow();
  app.on('activate', () => { if (!win && !quitting) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !manager) return;
  event.preventDefault();
  quitting = true;
  Promise.all([manager.shutdown(), gitService.shutdown()]).finally(() => app.quit());
});
