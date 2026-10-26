export interface TabInfo { id: number; url: string; title: string; favicon: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error?: string }
export interface Bookmark { id: string; title: string; url: string; folder: string; created: string }
export interface Visit { url: string; title: string; visited: string }
export interface SearchResult { title: string; url: string; description: string }
export interface AuthInfo { configured: boolean; userId: string; email: string; error: string; busy: boolean }
export interface MailMessage { id: string; senderId: string; recipientId: string; senderEmail: string; recipientEmail: string; subject: string; body: string; created: string; readAt: string | null; senderDeletedAt: string | null; recipientDeletedAt: string | null }
export interface Settings { searchEngine: string; homePage: string; showToolbar: boolean; showAddress: boolean; showStatus: boolean; blockPopups: boolean; defaultZoom: number; downloadPath: string; askDownloadPath: boolean }
export interface AppState { tabs: TabInfo[]; activeId: number; printTarget?: TabInfo; bookmarks: Bookmark[]; history: Visit[]; settings: Settings; auth: AuthInfo; mail: MailMessage[]; downloads: {name:string; state:string; received:number; total:number}[]; searchResults: SearchResult[]; searchSummary: string; searchLoading: boolean; searchError: string; isMaximized: boolean; isFullScreen: boolean }
