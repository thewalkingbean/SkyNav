import { app, BrowserWindow, WebContentsView, ipcMain, dialog, session, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, SearchResult, Settings, TabInfo } from '../types';
import { SkyNavBackend } from './backend';

type BrowserTab = { info: TabInfo; view?: WebContentsView };
const HOME = 'skynav://home';
const internal = new Set(['home','search','favorites','history','downloads','mail','print','help','options','account']);
let win: BrowserWindow;
let tabs: BrowserTab[] = [];
let activeId = 0;
let nextId = 1;
let printSourceId = 0;
let bounds = { x: 0, y: 0, width: 0, height: 0 };
let backend: SkyNavBackend;
let downloads: AppState['downloads'] = [];
let searchResults: SearchResult[] = [];
let searchSummary = '';
let searchLoading = false;
let searchError = '';
let searchRequest = 0;
let settings: Settings;

function defaultSettings(): Settings { return { searchEngine: 'https://duckduckgo.com/?q=%s', homePage: HOME, showToolbar: true, showAddress: true, showStatus: true, blockPopups: true, defaultZoom: 1, downloadPath: app.getPath('downloads'), askDownloadPath: true }; }
function load() {
  backend = new SkyNavBackend(defaultSettings(),()=>{settings=backend.settings;emit();});
  settings = backend.settings;
}
function active() { return tabs.find(tab => tab.info.id === activeId); }
function state(): AppState { return { tabs: tabs.map(tab => tab.info), activeId, printTarget: tabs.find(tab=>tab.info.id===printSourceId)?.info, bookmarks:backend.bookmarks, history:backend.history, mail:backend.mail, auth:backend.auth, settings, downloads, searchResults, searchSummary, searchLoading, searchError, isMaximized: win.isMaximized(), isFullScreen: win.isFullScreen() }; }
function emit() { if (!win.isDestroyed()) win.webContents.send('state', state()); }
function isInternal(url: string) { try { const parsed = new URL(url); return parsed.protocol === 'skynav:' && internal.has(parsed.hostname); } catch { return false; } }
function normalize(input: string): string {
  const value = input.trim();
  if (!value) return HOME;
  if (isInternal(value)) return value;
  if (/^view-source:https?:\/\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return `http://${value}`;
  if (/^[^\s.]+\.[^\s]+$/.test(value) || /^[^\s.]+\.[^\s]+\/.+/.test(value)) return `https://${value}`;
  return `skynav://search?q=${encodeURIComponent(value)}`;
}
async function runSearch(url: string) {
  const query = new URL(url).searchParams.get('q')?.trim().slice(0, 160) || '';
  const request = ++searchRequest;
  searchResults = []; searchSummary = ''; searchError = ''; searchLoading = !!query; emit();
  if (!query) return;
  try {
    const api = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=8`;
    const response = await fetch(api,{headers:{'User-Agent':'SkyNav/1.0 (desktop browser; search summaries)'}});
    if (!response.ok) throw new Error(`Source service returned ${response.status}`);
    const data = await response.json() as { pages?: Array<{title?:string;key?:string;description?:string;excerpt?:string}> };
    if (request !== searchRequest) return;
    const plain = (text:string) => text.replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
    searchResults = (data.pages||[]).filter(item=>item.title&&item.key).map(item=>({title:item.title!,url:`https://en.wikipedia.org/wiki/${encodeURIComponent(item.key!)}`,description:plain(item.description||item.excerpt||'')}));
    if (searchResults[0]) {
      const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(data.pages![0].key!)}`,{headers:{'User-Agent':'SkyNav/1.0 (desktop browser; search summaries)'}});
      if (summaryResponse.ok) { const summaryData = await summaryResponse.json() as {extract?:string}; if(request===searchRequest)searchSummary=plain(summaryData.extract||'').slice(0,600); }
    }
  } catch (error) { if(request===searchRequest)searchError=error instanceof Error?error.message:'Search is unavailable'; }
  finally { if(request===searchRequest){searchLoading=false;emit();} }
}
function visibleView(tab?: BrowserTab) {
  for (const other of tabs) if (other.view) win.contentView.removeChildView(other.view);
  if (tab?.view && !tab.view.webContents.isDestroyed()) { win.contentView.addChildView(tab.view); tab.view.setBounds(bounds); }
}
function recordVisit(url: string, title: string) {
  if (!/^https?:/.test(url)) return;
  void backend.recordVisit(url,title);
}
function accountTask(task:Promise<unknown>) {void task.catch(error=>{backend.auth.error=error instanceof Error?error.message:'Account request failed';emit();});}
function syncWeb(tab: BrowserTab) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return;
  const wc = tab.view.webContents;
  tab.info.url = wc.getURL() || tab.info.url;
  tab.info.title = wc.getTitle() || tab.info.url;
  tab.info.canGoBack = wc.navigationHistory.canGoBack();
  tab.info.canGoForward = wc.navigationHistory.canGoForward();
  emit();
}
function makeView(tab: BrowserTab) {
  const view = new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:browser'}});
  tab.view = view;
  const wc = view.webContents;
  wc.setZoomFactor(settings.defaultZoom);
  wc.on('did-start-loading',()=>{tab.info.loading=true; tab.info.error=undefined; emit();});
  wc.on('did-stop-loading',()=>{tab.info.loading=false; syncWeb(tab);});
  wc.on('page-title-updated',(_event,title)=>{tab.info.title=title; emit();});
  wc.on('page-favicon-updated',(_event,icons)=>{tab.info.favicon=icons.find(icon=>/^https?:/.test(icon)) || ''; emit();});
  wc.on('did-navigate',(_event,url)=>{syncWeb(tab); recordVisit(url,tab.info.title);});
  wc.on('did-navigate-in-page',(_event,url)=>{syncWeb(tab); recordVisit(url,tab.info.title);});
  wc.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{ if (isMainFrame && code !== -3) { tab.info.loading=false; tab.info.error=description; tab.info.url=url; emit(); } });
  wc.setWindowOpenHandler(({url,disposition})=>{ if (/^https?:/.test(url) && (!settings.blockPopups || disposition==='foreground-tab' || disposition==='background-tab')) setImmediate(()=>createTab(url)); return {action:'deny'}; });
  wc.on('will-navigate',(event,url)=>{ if (!/^https?:/.test(url) && !/^view-source:https?:/.test(url)) event.preventDefault(); });
}
function createTab(input=HOME) {
  const url=normalize(input);
  const tab: BrowserTab={info:{id:nextId++,url,title:isInternal(url)?url.slice(9).replace(/^./,c=>c.toUpperCase()):'New Tab',favicon:'',loading:false,canGoBack:false,canGoForward:false}};
  tabs.push(tab); activeId=tab.info.id;
  if (!isInternal(url)) { makeView(tab); tab.view!.webContents.loadURL(url).catch(()=>{}); }
  if (new URL(url).hostname === 'search' && isInternal(url)) void runSearch(url);
  visibleView(tab); emit(); return tab.info.id;
}
function navigate(input:string) {
  const tab=active(); if (!tab) return;
  const url=normalize(input);
  tab.info.url=url; tab.info.error=undefined; tab.info.favicon='';
  if (isInternal(url)) { if(tab.view) {win.contentView.removeChildView(tab.view);tab.view.webContents.close();tab.view=undefined;} tab.info.title=new URL(url).hostname.replace(/^./,c=>c.toUpperCase());tab.info.canGoBack=false;tab.info.canGoForward=false;tab.info.loading=false;visibleView(tab);emit();if(new URL(url).hostname==='search')void runSearch(url);return; }
  if (!tab.view) makeView(tab);
  visibleView(tab); tab.view!.webContents.loadURL(url).catch(()=>{}); emit();
}
function closeTab(id:number) {
  const index=tabs.findIndex(t=>t.info.id===id); if(index<0)return;
  const [tab]=tabs.splice(index,1); if(tab.view){win.contentView.removeChildView(tab.view);tab.view.webContents.close();}
  if (!tabs.length) createTab(HOME); else {if(activeId===id)activeId=tabs[Math.max(0,index-1)].info.id; visibleView(active());emit();}
}
function ensureSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) { if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('Untrusted sender'); }
function edit(action:string) {
  const wc=active()?.view?.webContents || win.webContents;
  if (action==='undo') wc.undo(); else if(action==='redo')wc.redo(); else if(action==='cut')wc.cut(); else if(action==='copy')wc.copy(); else if(action==='paste')wc.paste(); else if(action==='delete')wc.delete(); else if(action==='selectAll')wc.selectAll();
}
function command(action:string, payload?:any) {
  const tab=active(); const wc=tab?.view?.webContents;
  switch(action) {
    case 'new-tab': createTab(typeof payload==='string'?payload:HOME); break;
    case 'close-tab': closeTab(Number(payload)||activeId); break;
    case 'activate-tab': if(tabs.some(t=>t.info.id===Number(payload))){activeId=Number(payload);visibleView(active());emit();} break;
    case 'navigate': navigate(String(payload||'')); break;
    case 'web-search': {const query=String(payload||'').trim();if(query)navigate(settings.searchEngine.replace('%s',encodeURIComponent(query)));break;}
    case 'back': if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack(); break;
    case 'forward': if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward(); break;
    case 'refresh': wc?.reload(); break;
    case 'stop': wc?.stop(); break;
    case 'home': navigate(settings.homePage); break;
    case 'zoom-in': if(wc)wc.setZoomFactor(Math.min(3,wc.getZoomFactor()+0.1)); break;
    case 'zoom-out': if(wc)wc.setZoomFactor(Math.max(0.5,wc.getZoomFactor()-0.1)); break;
    case 'zoom-reset': wc?.setZoomFactor(settings.defaultZoom); break;
    case 'devtools': wc?.openDevTools(); break;
    case 'find': if(wc)wc.findInPage(String(payload||'')); break;
    case 'source': if(wc)createTab(`view-source:${wc.getURL()}`); break;
    case 'print-page': if(wc){printSourceId=tab!.info.id;createTab('skynav://print');} break;
    case 'fullscreen': win.setFullScreen(!win.isFullScreen());emit();break;
    case 'minimize': win.minimize();break;
    case 'maximize': win.isMaximized()?win.unmaximize():win.maximize();emit();break;
    case 'close-window': win.close();break;
    case 'edit': edit(String(payload));break;
    case 'bookmark-add': if(tab && /^https?:/.test(tab.info.url)){if(!backend.auth.userId)navigate('skynav://account');else accountTask(backend.addBookmark(tab.info.title,tab.info.url));}break;
    case 'bookmark-remove': accountTask(backend.removeBookmark(String(payload||'')));break;
    case 'bookmark-update': {const b=backend.bookmarks.find(b=>b.id===payload?.id);if(b)accountTask(backend.updateBookmark(b.id,String(payload.title||b.title),String(payload.folder||b.folder)));}break;
    case 'history-clear': accountTask(backend.clearHistory());break;
    case 'settings': settings={...settings,...payload};backend.settings=settings;if(backend.auth.userId)accountTask(backend.saveSettings(settings));emit();break;
    case 'cookies-clear': session.fromPartition('persist:browser').clearStorageData({storages:['cookies']});break;
    case 'print': (tabs.find(t=>t.info.id===printSourceId)?.view?.webContents||wc)?.print({silent:false,printBackground:true},()=>{});break;
  }
}
async function savePdf() {const wc=tabs.find(t=>t.info.id===printSourceId)?.view?.webContents||active()?.view?.webContents;if(!wc)return false;const result=await dialog.showSaveDialog(win,{defaultPath:'SkyNav Page.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled||!result.filePath)return false;fs.writeFileSync(result.filePath,await wc.printToPDF({printBackground:true}));return true;}
function shortcuts() {Menu.setApplicationMenu(null);win.webContents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown')return;const key=input.key.toLowerCase();const mod=input.control||input.meta; if(mod&&key==='l'){win.webContents.send('focus-address');event.preventDefault();}else if(mod&&key==='t'){createTab();event.preventDefault();}else if(mod&&key==='w'){closeTab(activeId);event.preventDefault();}else if(mod&&key==='d'){command('bookmark-add');event.preventDefault();}else if(mod&&key==='r'||key==='f5'){command('refresh');event.preventDefault();}else if(key==='f11'){command('fullscreen');event.preventDefault();}else if(mod&&key==='+'||mod&&key==='='){command('zoom-in');event.preventDefault();}else if(mod&&key==='-'){command('zoom-out');event.preventDefault();}else if(mod&&key==='0'){command('zoom-reset');event.preventDefault();}});}

app.whenReady().then(()=>{
  load();
  const browserSession=session.fromPartition('persist:browser');
  browserSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  browserSession.setPermissionCheckHandler(()=>false);
  browserSession.on('will-download',(_event,item)=>{const entry={name:item.getFilename(),state:'Downloading',received:0,total:item.getTotalBytes()};downloads.unshift(entry);if(!settings.askDownloadPath)item.setSavePath(path.join(settings.downloadPath,item.getFilename()));item.on('updated',()=>{entry.received=item.getReceivedBytes();entry.total=item.getTotalBytes();emit();});item.once('done',(_e,state)=>{entry.state=state;emit();});emit();});
  win=new BrowserWindow({width:1280,height:850,minWidth:800,minHeight:540,frame:false,backgroundColor:'#ece9d8',webPreferences:{preload:path.join(__dirname,'../preload/preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  void backend.initialize();
  win.loadFile(path.join(__dirname,'../../src/renderer/index.html'));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(__dirname,'../../src/renderer/index.html')).href)event.preventDefault();});
  win.on('resize',()=>emit());win.on('maximize',emit);win.on('unmaximize',emit);
  win.on('closed',()=>{for(const tab of tabs)tab.view?.webContents.close();});
  shortcuts();
  ipcMain.handle('get-state',event=>{ensureSender(event);return state();});
  ipcMain.handle('backend-configure',async(event,key:string)=>{ensureSender(event);await backend.configure(String(key));return true;});
  ipcMain.handle('backend-refresh',async event=>{ensureSender(event);await backend.refresh();return true;});
  ipcMain.handle('auth-sign-in',async(event,email:string,password:string)=>{ensureSender(event);await backend.signIn(String(email),String(password));return true;});
  ipcMain.handle('auth-sign-up',async(event,email:string,password:string)=>{ensureSender(event);return backend.signUp(String(email),String(password));});
  ipcMain.handle('auth-sign-out',async event=>{ensureSender(event);await backend.signOut();return true;});
  ipcMain.handle('mail-send',async(event,to:string,subject:string,body:string)=>{ensureSender(event);await backend.sendMail(String(to),String(subject),String(body));return true;});
  ipcMain.handle('mail-read',async(event,id:string)=>{ensureSender(event);await backend.markRead(String(id));return true;});
  ipcMain.handle('mail-delete',async(event,id:string)=>{ensureSender(event);await backend.deleteMail(String(id));return true;});
  ipcMain.on('command',(event,action,payload)=>{ensureSender(event);command(String(action),payload);});
  ipcMain.on('content-bounds',(event,rect)=>{ensureSender(event);bounds={x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:Math.max(0,Math.round(rect.width)),height:Math.max(0,Math.round(rect.height))};const view=active()?.view;if(view)view.setBounds(bounds);});
  ipcMain.handle('save-pdf',event=>{ensureSender(event);return savePdf();});
  ipcMain.handle('export-bookmarks',async event=>{ensureSender(event);const result=await dialog.showSaveDialog(win,{defaultPath:'SkyNav Bookmarks.html',filters:[{name:'HTML',extensions:['html']}]});if(result.canceled||!result.filePath)return false;const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');fs.writeFileSync(result.filePath,`<!DOCTYPE NETSCAPE-Bookmark-file-1><TITLE>SkyNav Bookmarks</TITLE><H1>SkyNav Bookmarks</H1><DL><p>\n${backend.bookmarks.map(b=>`<DT><A HREF="${escape(b.url)}">${escape(b.title)}</A>`).join('\n')}\n</DL>`);return true;});
  ipcMain.handle('import-bookmarks',async event=>{ensureSender(event);if(!backend.auth.userId)throw new Error('Sign in first');const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'HTML',extensions:['html','htm']}]});if(result.canceled)return false;const html=fs.readFileSync(result.filePaths[0],'utf8');for(const match of html.matchAll(/<A\s+[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi)){if(/^https?:\/\//.test(match[1]))await backend.addBookmark(match[2].replaceAll('&amp;','&'),match[1].replaceAll('&amp;','&'));}return true;});
  win.webContents.once('did-finish-load',()=>createTab(HOME));
});
app.on('window-all-closed',()=>app.quit());
