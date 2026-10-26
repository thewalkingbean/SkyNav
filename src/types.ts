export interface TabInfo { id: number; url: string; title: string; favicon: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error?: string }
export interface Bookmark { id: string; title: string; url: string; folder: string; created: string }
export interface Visit { url: string; title: string; visited: string }
export interface SearchResult { title: string; url: string; description: string }
export interface Settings { searchEngine: string; homePage: string; showToolbar: boolean; showAddress: boolean; showStatus: boolean; blockPopups: boolean; defaultZoom: number; downloadPath: string; askDownloadPath: boolean }
export interface AppState { tabs: TabInfo[]; activeId: number; printTarget?: TabInfo; bookmarks: Bookmark[]; history: Visit[]; settings: Settings; downloads: {name:string; state:string; received:number; total:number}[]; searchResults: SearchResult[]; searchSummary: string; searchLoading: boolean; searchError: string; isMaximized: boolean; isFullScreen: boolean }
