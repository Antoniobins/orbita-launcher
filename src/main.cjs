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
const logsEntry = pathToFileURL(path.join(__dirname, 'ui/logs.html')).href;
const logWindows = new Map();

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else if (manager && !quitting) createWindow(); });

function handler(name, callback) {
  ipcMain.handle('orbita:' + name, (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame.url !== entry) throw new Error('Origem inválida.');
    return callback(...args);
  });
}

function logHandler(name, callback) {
  ipcMain.handle('orbita:' + name, (event, ...args) => {
    const context = [...logWindows.values()].find(record => !record.window.isDestroyed() && record.window.webContents === event.sender);
    if (!context || event.senderFrame.url !== logsEntry) throw new Error('Origem inválida.');
    return callback(context, ...args);
  });
}

async function detachLogs(id, state) {
  const project = manager.get(id);
  const existing = logWindows.get(id);
  if (existing) { if (existing.window.isMinimized()) existing.window.restore(); existing.window.show(); existing.window.focus(); return; }
  const window = new BrowserWindow({
    title: `${project.name} — Logs · Órbita`, width: 960, height: 700, minWidth: 600, minHeight: 420,
    backgroundColor: '#fcfbfe', show: false,
    webPreferences: { preload: path.join(__dirname, 'logs-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !smoke }
  });
  const record = { id, state, window };
  logWindows.set(id, record);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { logWindows.delete(id); });
  try { await window.loadURL(logsEntry); window.show(); window.focus(); }
  catch (error) { window.destroy(); throw error; }
}

async function createWindow() {
  let smokeGitDir, smokeGitProject, smokeFlutterProject;
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
    const flutterDir = path.join(smokeGitDir, 'flutter-app');
    fs.mkdirSync(flutterDir);
    fs.writeFileSync(path.join(flutterDir, 'pubspec.yaml'), 'name: smoke_flutter\n');
    fs.writeFileSync(path.join(flutterDir, 'flutter'), '#!/bin/sh\nprintf "r Hot reload.\\nStarting application from main method in: fixture\\nINFO render-ready\\nWARNING deprecated-api\\nERROR sample-failure\\n"\nwhile IFS= read -r command; do if [ "$command" = r ]; then printf "Reloaded fixture successfully\\n"; fi; done\n', { mode: 0o755 });
    smokeFlutterProject = manager.save({ name: 'Orbita Flutter UI Test', path: flutterDir, group: 'Testes', command: `'${flutterDir.replace(/'/g, "'\\''")}/flutter' run -d chrome` });
  }
  win = new BrowserWindow({
    width: 1380, height: 900, minWidth: 980, minHeight: 680,
    title: 'Órbita — seus projetos, em movimento', backgroundColor: '#f7f8fa',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 22, y: 23 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !smoke }
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
        const flutterCard = () => [...document.querySelectorAll('.project-card')].find(el => el.querySelector('h3').textContent === 'Orbita Flutter UI Test');
        if (!flutterCard().querySelector('[data-action="hotReload"]').disabled) throw Error('Reload habilitado antes de iniciar');
        flutterCard().querySelector('[data-action="start"]').click();
        await waitFor(() => !flutterCard().querySelector('[data-action="hotReload"]').disabled);
        flutterCard().querySelector('[data-action="hotReload"]').click();
        flutterCard().querySelector('[data-action="logs"]').click();
        await waitFor(() => document.querySelector('#logs-output').textContent.includes('Reloaded fixture successfully'));
        const level = document.querySelector('#logs-level'), logSearch = document.querySelector('#logs-search');
        level.value = 'error'; level.dispatchEvent(new Event('change'));
        if (document.querySelector('#logs-output').textContent !== 'ERROR sample-failure') throw Error('Filtro de erros incorreto');
        logSearch.value = 'SAMPLE'; logSearch.dispatchEvent(new Event('input'));
        if (document.querySelector('#logs-output').textContent !== 'ERROR sample-failure') throw Error('Busca de logs incorreta');
        if (document.querySelector('#logs-output mark')?.textContent !== 'sample') throw Error('Marca-texto ausente na modal');
        logSearch.value = 'sem-resultado'; logSearch.dispatchEvent(new Event('input'));
        if (!document.querySelector('#copy-logs').disabled) throw Error('Cópia habilitada sem resultados');
        document.querySelector('#logs-reset').click();
        level.value = 'warning'; level.dispatchEvent(new Event('change'));
        if (document.querySelector('#logs-output').textContent !== 'WARNING deprecated-api') throw Error('Filtro de avisos incorreto');
        document.querySelector('#logs-reset').click();
        if (document.querySelector('#logs-output mark')) throw Error('Marca-texto não foi removido ao limpar');
        level.value = 'error'; level.dispatchEvent(new Event('change'));
        logSearch.value = 'SAMPLE'; logSearch.dispatchEvent(new Event('input'));
        document.querySelector('#logs-follow').checked = false;
        document.querySelector('#detach-logs').click();
        await waitFor(() => !document.querySelector('#logs-dialog').open);
        document.querySelector('#toast').hidden = true;
        return { title: document.title, cards: document.querySelectorAll('.project-card').length, bridge: typeof window.orbita.start };
      })()`);
      await new Promise(resolve => setTimeout(resolve, 250));
      const screenshotDir = app.isPackaged ? path.join(app.getPath('userData'), 'screenshots') : path.join(__dirname, '../screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const floating = logWindows.get(smokeFlutterProject.id)?.window;
      if (!floating || floating.isModal() || floating.getParentWindow()) throw new Error('Janela de logs não é independente.');
      floating.setBounds({ x: 120, y: 100, width: 820, height: 620 });
      if (floating.getBounds().width !== 820 || floating.getBounds().height !== 620) throw new Error('Janela de logs não redimensionou.');
      await floating.webContents.executeJavaScript(`(async () => {
        const waitFor = async check => { const end = Date.now() + 8000; while (!check()) { if (Date.now() > end) throw Error('Janela destacada não carregou'); await new Promise(r => setTimeout(r, 30)); } };
        await waitFor(() => document.querySelector('#logs-output mark')?.textContent === 'sample');
        if (document.querySelector('#logs-search').value !== 'SAMPLE' || document.querySelector('#logs-level').value !== 'error' || document.querySelector('#logs-follow').checked) throw Error('Filtros não foram preservados ao destacar');
        document.querySelector('#pin-logs').click();
        await waitFor(() => document.querySelector('#pin-logs').getAttribute('aria-pressed') === 'true');
      })()`);
      if (!floating.isAlwaysOnTop()) throw new Error('Janela não foi fixada no topo.');
      manager.log(smokeFlutterProject.id, '\nERROR sample-live-update <img src=x onerror=alert(1)>\n');
      await floating.webContents.executeJavaScript(`(async () => {
        const end = Date.now() + 8000;
        while (!document.querySelector('#logs-output').textContent.includes('sample-live-update')) { if (Date.now() > end) throw Error('Logs não atualizaram na janela destacada'); await new Promise(r => setTimeout(r, 30)); }
        if (document.querySelector('#logs-output img') || document.querySelectorAll('#logs-output mark').length !== 2) throw Error('Conteúdo dos logs não foi tratado como texto');
      })()`);
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(screenshotDir, 'orbita-logs-destacados.png'), (await floating.webContents.capturePage()).toPNG());
      await floating.webContents.executeJavaScript("document.querySelector('#attach-logs').click()");
      await win.webContents.executeJavaScript(`(async () => {
        const end = Date.now() + 8000;
        while (!document.querySelector('#logs-dialog').open) { if (Date.now() > end) throw Error('Logs não voltaram ao painel'); await new Promise(r => setTimeout(r, 30)); }
        if (document.querySelector('#logs-search').value !== 'SAMPLE' || document.querySelectorAll('#logs-output mark').length !== 2) throw Error('Estado não foi preservado ao voltar');
      })()`);
      fs.writeFileSync(path.join(screenshotDir, 'orbita-logs.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('#logs-dialog').close()");
      await manager.stop(smokeFlutterProject.id);
      manager.remove(smokeFlutterProject.id);
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(screenshotDir, 'orbita.png'), (await win.webContents.capturePage()).toPNG());
      console.log('SMOKE_OK', JSON.stringify(result));
      console.log('RELOAD_LOG_UI_OK hot reload + text + severity + reset');
      console.log('DETACHED_LOG_UI_OK independent window + resize + pin + live updates + highlighting + reattach');
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
  manager.on('change', projects => {
    if (win && !win.isDestroyed()) win.webContents.send('projects', projects);
    for (const { id, window } of logWindows.values()) if (!window.isDestroyed()) window.webContents.send('log-project', projects.find(p => p.id === id) || null);
  });
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
  handler('hotReload', id => manager.hotReload(id));
  handler('detachLogs', (id, state) => detachLogs(id, state));
  handler('focusLogs', id => {
    const record = logWindows.get(id);
    if (!record) return false;
    if (record.window.isMinimized()) record.window.restore();
    record.window.show(); record.window.focus(); return true;
  });
  logHandler('logsContext', record => ({ project: manager.list().find(p => p.id === record.id) || null, state: record.state }));
  logHandler('logsHotReload', record => manager.hotReload(record.id));
  logHandler('pinLogs', (record, pinned) => { record.window.setAlwaysOnTop(Boolean(pinned)); return record.window.isAlwaysOnTop(); });
  logHandler('attachLogs', async (record, state) => {
    if (quitting) throw new Error('O Órbita está encerrando.');
    if (!win || win.isDestroyed()) await createWindow();
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    win.webContents.send('logs-attached', { id: record.id, state });
    // Let the renderer receive the IPC response before closing its window.
    setTimeout(() => { if (!record.window.isDestroyed()) record.window.close(); }, 50);
  });
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
