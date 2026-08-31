# Supabase + Cloudflare Pages setup

This version uses:

- Supabase Postgres: persistent shared queue state.
- Supabase Realtime Broadcast: low-latency live state updates to every open browser/phone.
- Cloudflare Pages: hosts the React/Vite frontend.
- GitHub: source repository and automatic deployments.

## 1. Create the Supabase project

1. Open the Supabase dashboard and create a new project.
2. Open **SQL Editor**.
3. Run the complete contents of `supabase/schema.sql`.
4. Open **Connect** or **Settings > API Keys** and copy:
   - Project URL
   - Publishable key (`sb_publishable_...`)

Do not put a Supabase secret/service-role key in this frontend application.

## 2. Realtime setting

This app uses a **public Realtime Broadcast channel** named `pickleball-open-play`.

In Supabase, open **Realtime > Settings** and make sure **Allow public access to channels** is enabled.

For a community open-play board, this is the simplest setup. Public channels allow anyone with the public application key to subscribe and broadcast. If you later need strong admin security, move admin operations behind Supabase Auth/RLS or an Edge Function.

## 3. Local environment

The repository already contains `.env.example` at the project root. Copy it to `.env.local` and replace the placeholders:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

Install and run:

```bash
npm install
npm run dev
```

The app should show **Live sync connected** when the Supabase Realtime connection is established.

## 4. Live synchronization behavior

When the app changes the queue, court, player, or game state:

1. The new snapshot is written to `public.queue_state`.
2. The exact snapshot is sent through Realtime Broadcast event `state_update` on channel `pickleball-open-play`.
3. Other browsers receive the event and replace their local state immediately.
4. A newly opened browser first loads the persisted Supabase snapshot, then continues receiving broadcasts.

The app deliberately does not write the local/default state to Supabase until the first remote load has completed, preventing a new phone from overwriting the live session during startup.

## 5. Admin unlock

Tap the pickleball logo six times, then enter PIN `4951`.

Important: this PIN is a client-side convenience gate, not real authentication. Anyone who can inspect the frontend can discover it. Use Supabase Auth + server-side/RLS enforcement before using the admin functions as a security boundary.

## 6. Cloudflare Pages

Push the **contents of this `pickleball-open-play-v2` folder** to the root of your GitHub repository.

Cloudflare Pages build settings:

- Production branch: `main`
- Framework preset: `Vite` (or configure manually)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` when this folder is the GitHub repository root

If you instead push the outer folder and keep `pickleball-open-play-v2/` as a subfolder, set Cloudflare's Root directory to `/pickleball-open-play-v2`.

Add these Cloudflare environment variables for Production:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```
