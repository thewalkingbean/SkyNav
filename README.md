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

The Windows installer is written to `release/`. GitHub Actions also builds a Windows installer on pushes to `main` and makes it available as a workflow artifact.

## Connect Supabase

SkyNav targets the Supabase project `qltisxnhhorabusbutbp`. Apply [the database migration](supabase/migrations/20261026000000_skynav_backend.sql) to that project before creating accounts. With the Supabase CLI authenticated, run:

```powershell
npx supabase link --project-ref qltisxnhhorabusbutbp
npx supabase db push --dry-run
npx supabase db push
```

In SkyNav, open **Tools → SkyNav Account** and enter the project's **publishable key** from Supabase Project Settings → API Keys. You can also set `SKYNAV_SUPABASE_PUBLISHABLE_KEY` in the environment before launching. Use a publishable or legacy anon key only. Never use a service role or secret key in the desktop app.

Then sign up or sign in. Supabase may require email confirmation for new accounts. The project key and encrypted session are stored in Electron's per-user app data directory; neither is committed to Git. If the operating system cannot provide session encryption, SkyNav asks you to sign in again after restarting.

## Architecture

- `src/main/main.ts`: application window, tab `WebContentsView` instances, navigation, downloads, printing, and IPC validation.
- `src/main/backend.ts`: Supabase authentication and account data.
- `supabase/migrations/`: database schema, row level security, and internal mail functions.
- `src/preload/preload.ts`: small bridge available only to the trusted local chrome.
- `src/renderer/`: classic chrome and built-in pages.
- `assets/skynav-globe.png` and `assets/skynav.ico`: supplied globe artwork and its Windows app icon.

Remote pages have Node integration disabled, context isolation and sandboxing enabled, and no preload bridge. Account data is stored in Supabase with row level security. Browser session storage remains in Electron's per-user application data directory.

## Features

Real Chromium website navigation, HTTPS, multiple tabs, Back and Forward, Refresh and Stop, SkyNav search results from public source pages, titles and favicons, Supabase backed history, bookmarks and settings, HTML bookmark import and export, downloads, zoom, keyboard shortcuts, printing, PDF export, options, Help, and internal SkyNav Mail between registered accounts. SkyNav's controls use original SVG icons, with the supplied globe artwork retained for branding.

## Known limitations

- SkyNav Mail sends messages only between SkyNav accounts. It is not an external email client and does not use IMAP or SMTP.
- Account features need the Supabase migration applied and a project publishable key configured. Browsing works without signing in; bookmarks, history, settings sync, and mail require an account.
- The custom Print page delegates printer selection and preview to the system print dialog. Its illustration is not a live page preview.
- Website permissions are denied by default; no per-site permissions UI is implemented yet.
- The browser does not include extension support, sync, or automatic updates. The corresponding unavailable features are not presented as working controls.
- The current logo image includes the globe and airplane; the wordmark is rendered in CSS to match the supplied screenshots.
- The in-app search currently covers Wikipedia, with a link to the configured full-web search provider for broader results. Search summaries link to their source articles. No Google results or branding are embedded.
