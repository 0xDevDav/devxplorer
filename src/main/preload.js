const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  call: (name, ...args) => ipcRenderer.invoke(name, ...args),
  drag: (paths, icon) => ipcRenderer.send('drag', paths, icon),
  pathFor: file => webUtils.getPathForFile(file),
  onChanged: fn => ipcRenderer.on('changed', fn),
  onOpenFolder: fn => ipcRenderer.on('open-folder', (e, dir) => fn(dir)),
  onCloseViewer: fn => ipcRenderer.on('close-viewer', fn),
  onProgress: fn => ipcRenderer.on('progress', (e, report) => fn(report)),
  onUpdate: fn => ipcRenderer.on('update', (e, state) => fn(state)),
})
