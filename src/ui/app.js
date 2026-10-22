const paths = {
  reload: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m0-5h6a6 6 0 0 0 6-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Zm7-2v4m-2-2h4"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m0-11H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  terminal: '<path d="m5 7 5 5-5 5m8 0h6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  orbit: '<ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(35 12 12)"/><circle cx="12" cy="12" r="2"/>',
  feather: '<path d="M20 4c-4-4-12 1-12 7v5h5c6 0 11-8 7-12ZM3 21 17 7M8 12h4v4"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 10 8 15 7-5 13-10 8-15Z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.code}</svg>`;
const $ = selector => document.querySelector(selector);
if (window.orbita.platform !== 'darwin') {
  document.querySelectorAll('kbd').forEach(el => { el.textContent = el.textContent.replace('⌘', 'Ctrl'); });
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusLabels = { running: 'Em execução', starting: 'Iniciando…', stopping: 'Parando…', stopped: 'Parado', error: 'Precisa de atenção' };
const activeStatuses = ['running', 'starting', 'stopping'];
let projects = [], view = 'all', filter = 'all', query = '', sort = 'favorite', logsId = null, removeId = null, toastTimer;
const gitStates = new Map(), gitBusy = new Set();
let publishId = null, publishState = null, publishing = false;
const reloadBusy = new Set();

function fillIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8500 : 3200);
}
async function safely(action) { try { return await action(); } catch (error) { notify(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); } }
function statusHtml(project) { return `<span class="status ${escape(project.status)}"><i></i>${statusLabels[project.status] || 'Parado'}</span>`; }
function gitCard(project) {
  const state = gitStates.get(project.id), busy = gitBusy.has(project.id);
  const label = !state ? 'Verificando Git…' : !state.available ? 'Sem Git' : state.branch || 'Sem branch ativa';
  const disabled = busy || !state?.available || !state.branch || !state.remote;
  const reason = busy ? 'Operação Git em andamento' : !state ? 'Verificando repositório' : !state.available ? state.reason : !state.branch ? 'Escolha uma branch no editor' : !state.remote ? 'Configure um remoto origin ou o upstream da branch' : '';
  return `<div class="git-card"><div class="git-branch" title="${escape(reason || state?.root || '')}">${icon('branch')}<span>${escape(label)}</span>${state?.files?.length ? `<b>${state.files.length}</b>` : ''}</div><div class="git-card-actions"><button class="button secondary small" data-action="git-pull" ${disabled ? 'disabled' : ''} title="${escape(reason || 'Puxar atualizações da branch')}">${icon('download')}${busy ? 'Aguarde…' : 'Puxar'}</button><button class="button secondary small" data-action="git-publish" ${disabled ? 'disabled' : ''} title="${escape(reason || 'Revisar e publicar na branch')}">${icon('upload')}Publicar</button></div></div>`;
}
function card(project, groupIndex) {
  const busy = activeStatuses.includes(project.status), pending = ['starting', 'stopping'].includes(project.status);
  const symbol = ['feather', 'heart', 'code'][groupIndex % 3];
  const displayCommand = project.command.replace(/^'([^']+)'/, (_match, executable) => executable.split('/').pop());
  return `<article class="project-card ${project.status === 'running' ? 'running' : ''}" data-id="${escape(project.id)}" data-tone="${groupIndex % 3}">
    <div class="card-top"><span class="project-icon">${icon(symbol)}</span><div class="card-tools"><button class="icon-button ${project.favorite ? 'favorited' : ''}" data-action="favorite" title="${project.favorite ? 'Remover dos favoritos' : 'Favoritar'}" aria-label="${project.favorite ? 'Remover dos favoritos' : 'Favoritar'} ${escape(project.name)}" aria-pressed="${project.favorite}">${icon('star')}</button><button class="icon-button" data-action="edit" title="Editar projeto" aria-label="Editar ${escape(project.name)}" ${busy ? 'disabled' : ''}>${icon('edit')}</button><button class="icon-button" data-action="remove" title="Remover cadastro" aria-label="Remover ${escape(project.name)}" ${busy ? 'disabled' : ''}>${icon('trash')}</button></div></div>
    <h3 title="${escape(project.name)}">${escape(project.name)}</h3><p class="card-description">${escape(project.description || 'Pronto para a sua próxima sessão de criação.')}</p>
    <div class="card-tags"><span class="group-tag">${icon('folder')}${escape(project.group)}</span>${statusHtml(project)}</div>
    <div class="card-command" title="${escape(project.command)}"><span>›</span>${escape(displayCommand)}</div>
    ${project.error ? `<p class="card-error">${escape(project.error)}</p>` : ''}
    ${project.hotReloadSupported ? `<div class="reload-row"><span>Flutter · debug</span><button class="button secondary small" data-action="hotReload" ${project.status !== 'running' || !project.hotReloadReady || reloadBusy.has(project.id) ? 'disabled' : ''} title="Disponível quando o Flutter anunciar hot reload nos logs">${icon('reload')}${reloadBusy.has(project.id) ? 'Enviando…' : 'Hot reload'}</button></div>` : ''}
    <div class="card-bottom"><button class="button start-button ${busy ? 'stop-button' : ''}" data-action="${busy ? 'stop' : 'start'}" ${pending ? 'disabled' : ''}>${icon(busy ? 'stop' : 'play')}${pending ? statusLabels[project.status] : busy ? 'Parar projeto' : 'Iniciar projeto'}</button><button class="button secondary" data-action="open" title="Abrir no navegador" aria-label="Abrir ${escape(project.name)} no navegador" ${!project.url ? 'disabled' : ''}>${icon('external')}</button><button class="button secondary" data-action="editor" title="Abrir no VS Code" aria-label="Abrir ${escape(project.name)} no VS Code">${icon('code')}</button><button class="button secondary" data-action="logs" title="Ver logs" aria-label="Ver logs de ${escape(project.name)}">${icon('terminal')}</button><button class="button secondary" data-action="folder" title="Abrir pasta" aria-label="Abrir pasta de ${escape(project.name)}">${icon('folder')}</button></div>
    ${gitCard(project)}
  </article>`;
}
function viewName() { return view === 'all' ? 'Todos os projetos' : view === 'running' ? 'Em execução' : view === 'favorites' ? 'Favoritos' : view.slice(6); }
function render() {
  const running = projects.filter(p => activeStatuses.includes(p.status)).length;
  $('#all-count').textContent = $('#stat-total').textContent = projects.length;
  $('#running-count').textContent = running;
  $('#stat-running').innerHTML = running + '<span class="green-dot"></span>';
  $('#favorite-count').textContent = projects.filter(p => p.favorite).length;
  const groups = [...new Set(projects.map(p => p.group))].sort((a,b) => a.localeCompare(b));
  if (view.startsWith('group:') && !groups.includes(view.slice(6))) view = 'all';
  $('#collections').innerHTML = groups.map(group => `<button class="nav-item ${view === 'group:' + group ? 'active' : ''}" data-view="group:${escape(group)}"><span class="collection-dot"></span>${escape(group)}<span class="count">${projects.filter(p => p.group === group).length}</span></button>`).join('');
  $('#group-list').innerHTML = groups.map(group => `<option value="${escape(group)}"></option>`).join('');
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = viewName();
  const scope = projects.filter(p => view === 'all' || (view === 'running' && activeStatuses.includes(p.status)) || (view === 'favorites' && p.favorite) || view === 'group:' + p.group);
  let visible = scope.filter(p => (filter === 'all' || (filter === 'running' ? activeStatuses.includes(p.status) : !activeStatuses.includes(p.status))) && `${p.name} ${p.group} ${p.description} ${p.path}`.toLocaleLowerCase('pt-BR').includes(query));
  visible.sort((a,b) => (sort === 'favorite' ? Number(b.favorite) - Number(a.favorite) : sort === 'group' ? a.group.localeCompare(b.group) : 0) || a.name.localeCompare(b.name, 'pt-BR'));
  $('#section-title').innerHTML = escape(viewName()) + ` <span>${visible.length}</span>`;
  $('#tab-count').textContent = scope.length;
  $('#project-grid').innerHTML = visible.map(p => card(p, groups.indexOf(p.group))).join('');
  $('#empty').hidden = visible.length > 0;
  $('#empty-title').textContent = !projects.length ? 'Seu espaço para tirar ideias do papel.' : 'Nada por aqui. Ainda.';
  $('#empty-description').textContent = !projects.length ? 'Cadastre seu primeiro projeto e comece com um clique.' : 'Tente outra busca, mude o filtro ou adicione um projeto.';
  updateLogs();
}
function showForm(project) {
  const form = $('#project-form');
  form.reset();
  $('#form-error').textContent = '';
  $('#form-title').textContent = project ? 'Editar projeto' : 'Novo projeto';
  for (const key of ['id','name','group','url','path','command','description']) form.elements[key].value = project?.[key] || '';
  form.elements.favorite.checked = project?.favorite || false;
  $('#project-dialog').showModal();
  form.elements.name.focus();
}
function updateLogs() { logViewer.update(); }
const logViewer = new window.OrbitaLogView({
  getProject: () => projects.find(project => project.id === logsId),
  isVisible: () => $('#logs-dialog').open,
  onReload: id => reloadProject(id),
  onNotify: notify
});


fillIcons();
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { view = nav.dataset.view; filter = 'all'; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('selected', el.dataset.filter === filter)); render(); }
  const tab = event.target.closest('[data-filter]');
  if (tab) { filter = tab.dataset.filter; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('selected', el === tab)); render(); }
  const close = event.target.closest('.close-dialog');
  if (close) close.closest('dialog').close();
});
$('.brand').addEventListener('click', event => { event.preventDefault(); view = 'all'; render(); });
$('#new-project').addEventListener('click', () => showForm());
$('#empty-add').addEventListener('click', () => showForm());
$('#search').addEventListener('input', event => { query = event.target.value.toLocaleLowerCase('pt-BR'); render(); });
$('#sort').addEventListener('change', event => { sort = event.target.value; render(); });
$('#choose-folder').addEventListener('click', () => safely(async () => { const folder = await window.orbita.chooseFolder(); if (folder) $('#project-form').elements.path.value = folder; }));
$('#project-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const input = Object.fromEntries(new FormData(form));
  if (!input.id) delete input.id;
  input.favorite = form.elements.favorite.checked;
  $('#save-project').disabled = true;
  try { const saved = await window.orbita.save(input); $('#project-dialog').close(); await refreshGit(saved.id); notify('Projeto salvo. Tudo pronto para começar.'); }
  catch (error) { $('#form-error').textContent = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  finally { $('#save-project').disabled = false; }
});
$('#project-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const project = projects.find(p => p.id === button.closest('[data-id]').dataset.id);
  const action = button.dataset.action;
  if (action === 'hotReload') { safely(() => reloadProject(project.id)); return; }
  if (action === 'git-pull') { safely(() => pullProject(project)); return; }
  if (action === 'git-publish') { safely(() => showPublish(project)); return; }
  if (action === 'edit') { showForm(project); return; }
  if (action === 'logs') {
    safely(async () => {
      if (await window.orbita.focusLogs(project.id)) return;
      if (logsId !== project.id) { $('#logs-search').value = ''; $('#logs-level').value = 'all'; }
      logsId = project.id; $('#logs-dialog').showModal(); updateLogs(); $('#logs-output').scrollTop = $('#logs-output').scrollHeight;
    });
    return;
  }
  if (action === 'remove') { removeId = project.id; $('#remove-text').textContent = `O cadastro de “${project.name}” será removido da sua lista.`; $('#remove-dialog').showModal(); return; }
  safely(() => window.orbita[action](project.id));
});
$('#confirm-remove').addEventListener('click', () => safely(async () => { await window.orbita.remove(removeId); $('#remove-dialog').close(); notify('Cadastro removido.'); }));
$('#detach-logs').addEventListener('click', () => safely(async () => {
  await window.orbita.detachLogs(logsId, logViewer.state());
  $('#logs-dialog').close();
}));
window.orbita.onLogsAttached(({ id, state }) => {
  logsId = id;
  if (!$('#logs-dialog').open) $('#logs-dialog').showModal();
  logViewer.restore(state);
});
async function reloadProject(id) {
  if (reloadBusy.has(id)) return;
  reloadBusy.add(id); render();
  try { await window.orbita.hotReload(id); notify('Hot reload solicitado. Veja o resultado nos logs.'); }
  finally { setTimeout(() => { reloadBusy.delete(id); render(); }, 1000); }
}
document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey) {
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search').focus(); }
    if (event.key.toLowerCase() === 'n' && !document.querySelector('dialog[open]')) { event.preventDefault(); showForm(); }
  }
});
window.orbita.onChange(next => { projects = next; render(); });
async function refreshGit(id) {
  try { gitStates.set(id, await window.orbita.gitStatus(id)); }
  catch (error) { gitStates.set(id, { available: false, reason: error.message }); }
  render();
}
async function refreshAllGit() {
  const queue = projects.filter(p => !gitBusy.has(p.id)).map(p => p.id);
  await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await refreshGit(queue.shift()); }));
}
async function pullProject(project) {
  gitBusy.add(project.id); render();
  try { const result = await window.orbita.gitPull(project.id); gitStates.set(project.id, result.state); notify(result.message); }
  finally { gitBusy.delete(project.id); await refreshGit(project.id); }
}
async function showPublish(project) {
  if (gitBusy.has(project.id)) return;
  const state = await window.orbita.gitStatus(project.id);
  gitStates.set(project.id, state); render();
  if (!state.available) throw new Error(state.reason);
  if (!state.branch || !state.remote) throw new Error('Escolha uma branch e configure o remoto do projeto.');
  if (state.operation || state.files.some(file => file.conflict)) throw new Error('Resolva os conflitos ou conclua a operação Git no editor antes de publicar.');
  publishId = project.id; publishState = state;
  $('#git-title').textContent = `Publicar ${project.name}`;
  $('#git-target').textContent = `${state.branch} → ${state.remote}/${state.targetBranch}`;
  $('#git-root').textContent = state.root;
  $('#git-summary').textContent = `${state.files.length} arquivo(s) alterado(s) · ${state.ahead} commit(s) à frente do último estado conhecido do remoto.`;
  $('#git-files').innerHTML = state.files.length ? state.files.map((file, index) => `<label class="git-file"><input type="checkbox" name="files" value="${index}"><span class="git-file-status">${escape(file.status.trim())}</span><span title="${escape(file.path)}">${escape(file.path)}</span></label>`).join('') : '<p class="git-no-files">Nenhum arquivo alterado. Você pode enviar os commits locais.</p>';
  $('#git-select-all').hidden = !state.files.length;
  $('#git-select-all').textContent = 'Selecionar todos';
  $('#git-commit-message').value = '';
  $('#git-error').textContent = '';
  updatePublishButton();
  $('#git-dialog').showModal();
}
function selectedFiles() { return [...$('#git-files').querySelectorAll('input:checked')].map(el => publishState.files[Number(el.value)].path); }
function updatePublishButton() {
  const selected = selectedFiles().length;
  $('#git-submit').innerHTML = icon('upload') + (publishing ? 'Publicando…' : selected ? 'Criar commit e publicar' : 'Publicar commits');
  $('#git-submit').disabled = publishing;
  $('#git-commit-message').required = selected > 0;
}
$('#git-files').addEventListener('change', updatePublishButton);
$('#git-select-all').addEventListener('click', () => {
  const inputs = [...$('#git-files').querySelectorAll('input')];
  const checked = !inputs.every(el => el.checked);
  inputs.forEach(el => { el.checked = checked; });
  $('#git-select-all').textContent = checked ? 'Desmarcar todos' : 'Selecionar todos';
  updatePublishButton();
});
$('#git-dialog').addEventListener('cancel', event => { if (publishing) event.preventDefault(); });
$('#git-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (publishing) return;
  const input = { files: selectedFiles(), message: $('#git-commit-message').value, branch: publishState.branch, head: publishState.head, remote: publishState.remote, targetBranch: publishState.targetBranch };
  publishing = true; gitBusy.add(publishId); updatePublishButton(); render();
  $('#git-form').querySelectorAll('input, .close-dialog, #git-select-all').forEach(el => { el.disabled = true; });
  try {
    const result = await window.orbita.gitPublish(publishId, input);
    gitStates.set(publishId, result.state); $('#git-dialog').close(); notify(result.message);
  } catch (error) { $('#git-error').textContent = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') + '\nPara tentar novamente, feche esta janela e abra Publicar para revisar o estado atualizado.'; }
  finally {
    publishing = false; gitBusy.delete(publishId);
    $('#git-form').querySelectorAll('input, .close-dialog, #git-select-all').forEach(el => { el.disabled = false; });
    updatePublishButton(); await refreshGit(publishId);
  }
});
window.addEventListener('focus', () => { if (!publishing && !document.querySelector('dialog[open]')) refreshAllGit(); });
safely(async () => { projects = await window.orbita.list(); render(); await refreshAllGit(); });
