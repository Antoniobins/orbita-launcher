const { contextBridge, ipcRenderer } = require('electron');
const call = name => (...args) => ipcRenderer.invoke('orbita:' + name, ...args);
contextBridge.exposeInMainWorld('orbitaLogWindow', {
  context: call('logsContext'), hotReload: call('logsHotReload'), pin: call('pinLogs'), attach: call('attachLogs'),
  onProject: callback => {
    const listener = (_event, project) => callback(project);
    ipcRenderer.on('log-project', listener);
    return () => ipcRenderer.removeListener('log-project', listener);
  }
});
