# Turning on sync

Until you do this, MyCAL works exactly as it does now — everything lives in the
browser it was typed into, and the **Sync** button doesn't appear at all. Nothing
below is required to use the app.

Takes about five minutes.

## 1. Make a Supabase project

Go to [supabase.com](https://supabase.com), sign in with GitHub, **New project**.
Free tier is plenty. Pick any name and region near you, and let it finish
provisioning (~2 min).

## 2. Create the table

Open **SQL Editor** in the left sidebar, paste this, hit run:

```sql
create table if not exists mycal_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table mycal_state enable row level security;

-- Your row and nobody else's. Without this the anon key would be a problem;
-- with it, the key is safe to ship in a public build.
create policy "own row only" on mycal_state
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lets the other device pick up a change without a reload.
alter publication supabase_realtime add table mycal_state;
```

## 3. Allow the app to sign you in

**Authentication → URL Configuration**:

- **Site URL**: `https://migthycoder.github.io/MyCAL/`
- **Redirect URLs**: add both
  - `https://migthycoder.github.io/MyCAL/`
  - `http://localhost:5273/`

## 4. Give the build your keys

**Project Settings → API** has two values you need: the **Project URL** and the
**anon public** key. (The anon key is meant to be public — RLS above is what
actually protects your data. Never use the `service_role` key here.)

In the repo: **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon public key |

Then **Actions → Deploy to GitHub Pages → Run workflow** to rebuild with them.

For `npm run dev` locally, make a `.env.local` (already gitignored):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 5. Put the code in the email

Sign-in uses a six-digit code, not a link — on a phone a link opens the browser,
which signs the browser in and leaves an installed home-screen app logged out.

**Authentication → Emails → Magic Link**, replace the body with:

```html
<h2>Your MyCAL sign-in code</h2>
<p style="font-size:30px;letter-spacing:8px;margin:18px 0"><strong>{{ .Token }}</strong></p>
<p>Type this into MyCAL. It expires in an hour.</p>
<p style="color:#888;font-size:13px">On the same device you can also just
<a href="{{ .ConfirmationURL }}">tap here</a>.</p>
```

`{{ .Token }}` is the part that matters. The link is kept as a convenience for
desktop.

## 6. Sign in on both devices

A **Sync** button appears in the header. Enter your email, type the code it sends,
and do the same on your phone with the same address. Whatever is already on each
device gets merged in rather than overwritten.

## How the merging works

Your whole calendar is stored as one document per account.

- Changes push about a second and a half after you stop making them, and land on
  your other device without a reload.
- Blocks and notes are merged as a **union** — adding Streetplay on the laptop and
  CCIR on the phone keeps both.
- Editing **the same block** in both places within the same moment is the one case
  that picks a winner: the more recently touched device wins.
- Deleting on one device removes it everywhere. But a deletion that races an edit
  on the other device can lose to that edit — the block comes back. Rare enough to
  live with, and better than the reverse.
