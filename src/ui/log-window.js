const $ = selector => document.querySelector(selector);
let project = null, toastTimer, pinned = false;
function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  $('#toast').classList.toggle('error', error); $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8500 : 3200);
}
const viewer = new window.OrbitaLogView({
  getProject: () => project,
  onReload: async () => { await window.orbitaLogWindow.hotReload(); notify('Hot reload solicitado. Veja o resultado nos logs.'); },
  onNotify: notify
});
window.orbitaLogWindow.onProject(next => { project = next; viewer.update(); });
$('#attach-logs').addEventListener('click', async () => {
  try { await window.orbitaLogWindow.attach(viewer.state()); } catch (error) { notify(error.message, true); }
});
$('#pin-logs').addEventListener('click', async () => {
  try { pinned = await window.orbitaLogWindow.pin(!pinned); $('#pin-logs').setAttribute('aria-pressed', String(pinned)); $('#pin-logs').textContent = pinned ? 'Fixado no topo' : 'Sempre no topo'; }
  catch (error) { notify(error.message, true); }
});
(async () => {
  try { const context = await window.orbitaLogWindow.context(); project = context.project; viewer.restore(context.state); }
  catch (error) { notify(error.message, true); }
})();
