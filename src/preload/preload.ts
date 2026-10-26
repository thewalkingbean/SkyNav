import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from '../types';
contextBridge.exposeInMainWorld('skynav', {
  getState: ():Promise<AppState>=>ipcRenderer.invoke('get-state'),
  command: (action:string,payload?:unknown)=>ipcRenderer.send('command',action,payload),
  setContentBounds: (rect:{x:number;y:number;width:number;height:number})=>ipcRenderer.send('content-bounds',rect),
  savePdf: ():Promise<boolean>=>ipcRenderer.invoke('save-pdf'),
  exportBookmarks: ():Promise<boolean>=>ipcRenderer.invoke('export-bookmarks'),
  importBookmarks: ():Promise<boolean>=>ipcRenderer.invoke('import-bookmarks'),
  onState: (callback:(state:AppState)=>void)=>ipcRenderer.on('state',(_event,state)=>callback(state)),
  onFocusAddress: (callback:()=>void)=>ipcRenderer.on('focus-address',()=>callback())
});
