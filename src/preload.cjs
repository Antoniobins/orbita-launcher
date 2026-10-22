const { contextBridge, ipcRenderer } = require('electron');
const call = method => (...args) => ipcRenderer.invoke('orbita:' + method, ...args);
contextBridge.exposeInMainWorld('orbita', {
  platform: process.platform,
  list: call('list'), save: call('save'), start: call('start'), stop: call('stop'),
  hotReload: call('hotReload'),
  detachLogs: call('detachLogs'), focusLogs: call('focusLogs'),
  remove: call('remove'), favorite: call('favorite'), chooseFolder: call('chooseFolder'),
  open: call('open'), editor: call('editor'), folder: call('folder'),
  gitStatus: call('gitStatus'), gitPull: call('gitPull'), gitPublish: call('gitPublish'),
  onChange: callback => { const handler = (_event, projects) => callback(projects); ipcRenderer.on('projects', handler); return () => ipcRenderer.removeListener('projects', handler); },
  onLogsAttached: callback => { const handler = (_event, state) => callback(state); ipcRenderer.on('logs-attached', handler); return () => ipcRenderer.removeListener('logs-attached', handler); }
});
