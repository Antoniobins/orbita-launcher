const { contextBridge, ipcRenderer } = require('electron');
const call = method => (...args) => ipcRenderer.invoke('orbita:' + method, ...args);
contextBridge.exposeInMainWorld('orbita', {
  list: call('list'), save: call('save'), start: call('start'), stop: call('stop'),
  hotReload: call('hotReload'),
  remove: call('remove'), favorite: call('favorite'), chooseFolder: call('chooseFolder'),
  open: call('open'), editor: call('editor'), folder: call('folder'),
  gitStatus: call('gitStatus'), gitPull: call('gitPull'), gitPublish: call('gitPublish'),
  onChange: callback => { const handler = (_event, projects) => callback(projects); ipcRenderer.on('projects', handler); return () => ipcRenderer.removeListener('projects', handler); }
});
