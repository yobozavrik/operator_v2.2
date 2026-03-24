# Developer Runbook

## 1. Local Environment Setup

### Prerequisites
- Node.js >= 20.0.0
- npm or yarn

### Configuration (`.env.local`)
Ensure your `.env.local` contains the following keys:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
POSTER_TOKEN=...
NODE_TLS_REJECT_UNAUTHORIZED=0
```
> [!WARNING]
> Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` is required for some local environments to bypass certificate issues when connecting to internal services, but should be used with caution.

## 2. Common Operations

### Starting Development Server
```bash
npm run dev
```
If you encounter a port conflict (EADDRINUSE), identify the process using port 3000 and terminate it:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Building for Production
```bash
npm run build
```
Vercel handles this automatically on push, but it is recommended to run it locally before pushing to catch TypeScript errors.

## 3. Troubleshooting

### Port 3000 is occupied / Lock file issue
If Next.js crashes or is forcefully terminated, it might leave a `.next/dev/lock` file or keep the port occupied. 
1. Delete the `.next` directory.
2. Terminate all `node.exe` processes.
3. Restart `npm run dev`.

### Data Mismatch (Local vs Vercel)
If data differs between environments:
1. Verify `POSTER_TOKEN` is set in Vercel Project Settings.
2. Check Vercel logs for "poster_merge_results" JSON entries to see if matching logic is failing.
3. Ensure no temporary scripts in `tmp/` are interfering with the build (these should be git-ignored).

### Database Schema Updates
New views and functions should be added via migrations in `supabase/migrations/`. 
To test a migration locally:
1. Paste the SQL into the Supabase SQL Editor.
2. Verify permissions: `GRANT USAGE ON SCHEMA ... TO anon, authenticated, service_role;`
