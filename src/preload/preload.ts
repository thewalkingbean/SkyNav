import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from '../types';
contextBridge.exposeInMainWorld('skynav', {
  getState: ():Promise<AppState>=>ipcRenderer.invoke('get-state'),
  configureBackend: (key:string):Promise<boolean>=>ipcRenderer.invoke('backend-configure',key),
  refreshBackend: ():Promise<boolean>=>ipcRenderer.invoke('backend-refresh'),
  signIn: (email:string,password:string):Promise<boolean>=>ipcRenderer.invoke('auth-sign-in',email,password),
  signUp: (email:string,password:string):Promise<string>=>ipcRenderer.invoke('auth-sign-up',email,password),
  signOut: ():Promise<boolean>=>ipcRenderer.invoke('auth-sign-out'),
  sendMail: (to:string,subject:string,body:string):Promise<boolean>=>ipcRenderer.invoke('mail-send',to,subject,body),
  markMailRead: (id:string):Promise<boolean>=>ipcRenderer.invoke('mail-read',id),
  deleteMail: (id:string):Promise<boolean>=>ipcRenderer.invoke('mail-delete',id),
  command: (action:string,payload?:unknown)=>ipcRenderer.send('command',action,payload),
  setContentBounds: (rect:{x:number;y:number;width:number;height:number})=>ipcRenderer.send('content-bounds',rect),
  savePdf: ():Promise<boolean>=>ipcRenderer.invoke('save-pdf'),
  exportBookmarks: ():Promise<boolean>=>ipcRenderer.invoke('export-bookmarks'),
  importBookmarks: ():Promise<boolean>=>ipcRenderer.invoke('import-bookmarks'),
  onState: (callback:(state:AppState)=>void)=>ipcRenderer.on('state',(_event,state)=>callback(state)),
  onFocusAddress: (callback:()=>void)=>ipcRenderer.on('focus-address',()=>callback())
});
