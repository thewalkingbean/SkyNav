# SkyNav Internet Browser

SkyNav is a Windows desktop browser with Windows XP era chrome and a modern Electron Chromium engine.

## Install and run

Requires Node.js 24 or newer and Windows 10 or 11.

```powershell
cd SkyNav
npm.cmd install
npm.cmd start
```

PowerShell systems that allow npm scripts can use `npm` in place of `npm.cmd`.

## Build

```powershell
npm.cmd run build
npm.cmd run pack:win
```

The Windows installer is written to `release/`. The app build uses Electron Builder and may download signing or packaging tools during the first build.

## Architecture

- `src/main/main.ts`: application window, tab `WebContentsView` instances, navigation, storage, downloads, printing, and IPC validation.
- `src/preload/preload.ts`: small bridge available only to the trusted local chrome.
- `src/renderer/`: classic chrome and built-in pages.
- `assets/skynav-globe.png`: supplied SkyNav globe and airplane art.

Remote pages have Node integration disabled, context isolation and sandboxing enabled, and no preload bridge. Browser state is stored in Electron's per-user application data directory.

## Features

Real Chromium website navigation, HTTPS, multiple tabs, Back and Forward, Refresh and Stop, SkyNav search results from public source pages, titles and favicons, local history and bookmarks, HTML bookmark import and export, downloads, zoom, keyboard shortcuts, printing, PDF export, options, Help, and a clearly labeled local Mail demonstration. SkyNav's controls use original SVG icons, with the supplied globe artwork retained for branding.

## Known limitations

- SkyNav Mail has sample messages only. It does not connect to an account or send messages.
- The custom Print page delegates printer selection and preview to the system print dialog. Its illustration is not a live page preview.
- Website permissions are denied by default; no per-site permissions UI is implemented yet.
- The browser does not include extension support, sync, or automatic updates. The corresponding unavailable features are not presented as working controls.
- The current logo image includes the globe and airplane; the wordmark is rendered in CSS to match the supplied screenshots.
- The in-app search currently covers Wikipedia, with a link to the configured full-web search provider for broader results. Search summaries link to their source articles. No Google results or branding are embedded.
