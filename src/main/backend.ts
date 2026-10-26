import { app, safeStorage } from 'electron';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthInfo, Bookmark, MailMessage, Settings, Visit } from '../types';

const PROJECT_REF = 'qltisxnhhorabusbutbp';
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

export class SkyNavBackend {
  private client?: SupabaseClient;
  private configFile = path.join(app.getPath('userData'), 'supabase-config.json');
  private sessionFile = path.join(app.getPath('userData'), 'supabase-session.bin');
  readonly auth: AuthInfo = { configured:false, userId:'', email:'', error:'', busy:false };
  bookmarks: Bookmark[] = [];
  history: Visit[] = [];
  mail: MailMessage[] = [];
  settings: Settings;
  constructor(defaults: Settings, private changed: () => void) { this.settings = defaults; }

  async initialize() {
    let key = process.env.SKYNAV_SUPABASE_PUBLISHABLE_KEY || '';
    if (!key) { try { key = JSON.parse(fs.readFileSync(this.configFile,'utf8')).publishableKey || ''; } catch { /* not configured */ } }
    if (key) await this.configure(key, false);
  }
  async configure(publishableKey: string, persist = true) {
    const key = publishableKey.trim();
    const modern = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);
    let legacyAnon = false;
    if (key.startsWith('eyJ')) {
      try { const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8')); legacyAnon = payload.role === 'anon'; } catch { /* invalid JWT */ }
    }
    if (!modern && !legacyAnon) throw new Error('Enter this project’s publishable or legacy anon key. Service role and secret keys are not accepted.');
    this.client = createClient(PROJECT_URL,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:{
      getItem: () => { try { if(!safeStorage.isEncryptionAvailable())return null;return safeStorage.decryptString(fs.readFileSync(this.sessionFile)); } catch { return null; } },
      setItem: (_name,value) => { if(safeStorage.isEncryptionAvailable())fs.writeFileSync(this.sessionFile,safeStorage.encryptString(value)); },
      removeItem: () => { try { fs.unlinkSync(this.sessionFile); } catch { /* already removed */ } }
    }}});
    if (persist) fs.writeFileSync(this.configFile,JSON.stringify({projectRef:PROJECT_REF,publishableKey:key}));
    this.auth.configured=true;this.auth.error='';
    const {data,error}=await this.client.auth.getUser();
    if (error && error.name!=='AuthSessionMissingError') this.auth.error=error.message;
    if (data.user) {this.auth.userId=data.user.id;this.auth.email=data.user.email||'';await this.refresh();}
    this.changed();
  }
  private requireClient() { if(!this.client)throw new Error('Connect Supabase first');return this.client; }
  private requireUser() { if(!this.auth.userId)throw new Error('Sign in to SkyNav first');return this.auth.userId; }
  private async result<T>(promise: PromiseLike<{data:T;error:any}>) {const {data,error}=await promise;if(error)throw new Error(error.message);return data;}
  async signIn(email:string,password:string) {
    this.auth.busy=true;this.auth.error='';this.changed();
    try {const {data,error}=await this.requireClient().auth.signInWithPassword({email:email.trim(),password});if(error)throw error;this.auth.userId=data.user.id;this.auth.email=data.user.email||'';await this.refresh();}
    catch(error){this.auth.error=error instanceof Error?error.message:'Sign in failed';throw error;}
    finally{this.auth.busy=false;this.changed();}
  }
  async signUp(email:string,password:string) {
    const {data,error}=await this.requireClient().auth.signUp({email:email.trim(),password});
    if(error)throw error;
    if(data.session&&data.user){this.auth.userId=data.user.id;this.auth.email=data.user.email||'';await this.refresh();return 'Account created and signed in.';}
    return 'Check your email for the confirmation link, then sign in.';
  }
  async signOut() {await this.requireClient().auth.signOut();this.auth.userId='';this.auth.email='';this.bookmarks=[];this.history=[];this.mail=[];this.changed();}
  async refresh() {
    const client=this.requireClient(),owner=this.requireUser();
    try {
      const [bookmarks,history,settings,mail]=await Promise.all([
        this.result(client.from('bookmarks').select('id,title,url,folder,created_at').eq('owner_id',owner).order('created_at',{ascending:false})),
        this.result(client.from('browsing_history').select('url,title,visited_at').eq('owner_id',owner).order('visited_at',{ascending:false}).limit(1000)),
        this.result(client.from('user_settings').select('preferences').eq('owner_id',owner).maybeSingle()),
        this.result(client.from('mail_messages').select('*').or(`sender_id.eq.${owner},recipient_id.eq.${owner}`).order('created_at',{ascending:false}).limit(200))
      ]);
      this.bookmarks=(bookmarks||[]).map((row:any)=>({id:row.id,title:row.title,url:row.url,folder:row.folder,created:row.created_at}));
      this.history=(history||[]).map((row:any)=>({url:row.url,title:row.title,visited:row.visited_at}));
      if(settings?.preferences&&typeof settings.preferences==='object')this.settings={...this.settings,...settings.preferences};
      this.mail=(mail||[]).map((row:any)=>({id:row.id,senderId:row.sender_id,recipientId:row.recipient_id,senderEmail:row.sender_email,recipientEmail:row.recipient_email,subject:row.subject,body:row.body,created:row.created_at,readAt:row.read_at,senderDeletedAt:row.sender_deleted_at,recipientDeletedAt:row.recipient_deleted_at}));
      this.auth.error='';this.changed();
    } catch(error){this.auth.error=error instanceof Error?error.message:'Could not load account data';this.changed();}
  }
  async addBookmark(title:string,url:string,folder='Favorites') {const owner_id=this.requireUser();await this.result(this.requireClient().from('bookmarks').insert({owner_id,title,url,folder}).select());await this.refresh();}
  async removeBookmark(id:string) {await this.result(this.requireClient().from('bookmarks').delete().eq('id',id).eq('owner_id',this.requireUser()).select());await this.refresh();}
  async updateBookmark(id:string,title:string,folder:string) {await this.result(this.requireClient().from('bookmarks').update({title,folder}).eq('id',id).eq('owner_id',this.requireUser()).select());await this.refresh();}
  async recordVisit(url:string,title:string) {if(!this.auth.userId)return;try {await this.result(this.requireClient().from('browsing_history').insert({owner_id:this.auth.userId,url,title}).select());this.history.unshift({url,title,visited:new Date().toISOString()});this.history=this.history.slice(0,1000);this.changed();} catch(error){this.auth.error=error instanceof Error?error.message:'Could not save visit';this.changed();}}
  async clearHistory() {await this.result(this.requireClient().from('browsing_history').delete().eq('owner_id',this.requireUser()).select());this.history=[];this.changed();}
  async saveSettings(settings:Settings) {const owner_id=this.requireUser();await this.result(this.requireClient().from('user_settings').upsert({owner_id,preferences:settings,updated_at:new Date().toISOString()}).select());this.settings=settings;this.changed();}
  async sendMail(toEmail:string,subject:string,body:string) {this.requireUser();await this.result(this.requireClient().rpc('send_skynav_mail',{to_email:toEmail,mail_subject:subject,mail_body:body}));await this.refresh();}
  async markRead(id:string) {this.requireUser();await this.result(this.requireClient().rpc('mark_skynav_mail_read',{message_id:id}));await this.refresh();}
  async deleteMail(id:string) {this.requireUser();await this.result(this.requireClient().rpc('delete_skynav_mail',{message_id:id}));await this.refresh();}
}
