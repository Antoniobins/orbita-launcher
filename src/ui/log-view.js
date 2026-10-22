// Shared log controls for the dashboard dialog and the independent window.
(function () {
  const labels = { running: 'Em execução', starting: 'Iniciando…', stopping: 'Parando…', stopped: 'Parado', error: 'Precisa de atenção' };
  window.OrbitaLogView = class {
    constructor({ getProject, isVisible = () => true, onReload, onNotify }) {
      this.getProject = getProject;
      this.isVisible = isVisible;
      this.onReload = onReload;
      this.onNotify = onNotify;
      this.el = Object.fromEntries(['logs-title','logs-status','logs-output','logs-search','logs-level','logs-count','copy-logs','logs-hot-reload','logs-follow','logs-command','logs-reset'].map(id => [id, document.getElementById(id)]));
      this.visibleText = '';
      this.reloadBusy = false;
      this.el['logs-search'].addEventListener('input', () => this.update());
      this.el['logs-level'].addEventListener('change', () => this.update());
      this.el['logs-reset'].addEventListener('click', () => { this.el['logs-search'].value = ''; this.el['logs-level'].value = 'all'; this.update(); });
      this.el['logs-follow'].addEventListener('change', () => { if (this.el['logs-follow'].checked) this.el['logs-output'].scrollTop = this.el['logs-output'].scrollHeight; });
      this.el['copy-logs'].addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(this.visibleText); this.onNotify('Logs filtrados copiados.'); }
        catch (error) { this.onNotify(error.message, true); }
      });
      this.el['logs-hot-reload'].addEventListener('click', async () => {
        if (this.reloadBusy) return;
        this.reloadBusy = true; this.update();
        try { await this.onReload(this.getProject()?.id); }
        catch (error) { this.onNotify(error.message, true); }
        finally { setTimeout(() => { this.reloadBusy = false; this.update(); }, 1000); }
      });
    }
    state() {
      return { query: this.el['logs-search'].value, level: this.el['logs-level'].value, follow: this.el['logs-follow'].checked, scrollTop: this.el['logs-output'].scrollTop };
    }
    restore(state = {}) {
      this.el['logs-search'].value = typeof state.query === 'string' ? state.query : '';
      this.el['logs-level'].value = ['all','error','warning','info'].includes(state.level) ? state.level : 'all';
      this.el['logs-follow'].checked = state.follow !== false;
      this.pendingScroll = Number.isFinite(state.scrollTop) ? Math.max(0, state.scrollTop) : null;
      this.update();
    }
    update() {
      if (!this.isVisible()) return;
      const project = this.getProject();
      if (!project) {
        this.el['logs-title'].textContent = 'Projeto removido';
        this.el['logs-output'].textContent = 'O cadastro deste projeto foi removido do Órbita.';
        this.el['logs-hot-reload'].disabled = this.el['copy-logs'].disabled = true;
        this.el['logs-count'].textContent = '0 linhas';
        this.visibleText = '';
        return;
      }
      document.title = document.body.classList.contains('detached-log-page') ? `${project.name} — Logs · Órbita` : document.title;
      this.el['logs-title'].textContent = project.name;
      const status = document.createElement('span'); status.className = 'status ' + project.status;
      status.append(document.createElement('i'), document.createTextNode(labels[project.status] || 'Parado'));
      this.el['logs-status'].replaceChildren(status);
      const output = this.el['logs-output'], state = this.state();
      const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 50;
      const result = window.orbitaLogs.filterLogs(project.logs, state.query, state.level);
      this.visibleText = result.text;
      const content = !result.total ? 'Os logs aparecem aqui quando você iniciar o projeto.' : !result.count ? 'Nenhuma linha corresponde aos filtros.' : result.text;
      const segments = result.count ? window.orbitaLogs.highlightSegments(content, state.query) : [{ text: content, match: false }];
      const matches = segments.filter(part => part.match).length;
      if (this.lastContent !== content || this.lastQuery !== state.query) {
        const fragment = document.createDocumentFragment();
        for (const part of segments) {
          if (part.match) { const mark = document.createElement('mark'); mark.textContent = part.text; fragment.append(mark); }
          else fragment.append(document.createTextNode(part.text));
        }
        output.replaceChildren(fragment);
        this.lastContent = content; this.lastQuery = state.query;
      }
      this.el['logs-count'].textContent = `${result.count} de ${result.total} linhas` + (state.query ? ` · ${matches} ocorrência(s)` : '');
      this.el['copy-logs'].disabled = !result.count;
      const reload = this.el['logs-hot-reload'];
      reload.hidden = !project.hotReloadSupported;
      reload.disabled = project.status !== 'running' || !project.hotReloadReady || this.reloadBusy;
      this.el['logs-command'].textContent = project.command;
      if (this.pendingScroll !== null && this.pendingScroll !== undefined) { output.scrollTop = this.pendingScroll; this.pendingScroll = null; }
      else if (atBottom && state.follow) output.scrollTop = output.scrollHeight;
    }
  };
})();
