# Pedigree Archive — Setup

This is a **fully functional multi-user web app** using a free Supabase backend (auth + database + photo storage) and Netlify hosting. Total monthly cost: **$0**.

> ✅ **Steps 1 & 2 are already done for project `gnxqhhtzweiqpwpvsqqn` ("Family Tree").** Schema applied, security advisors clean, credentials wired into `js/config.js`. You only need step 3 below.

---

## 1. Create a free Supabase project ✅ DONE

(Project already provisioned. The `supabase-schema.sql` in this repo was applied via the Supabase MCP — `profiles` table with row-level security, the auto-create-profile trigger, and the `photos` storage bucket are all in place.)

---

## 2. Paste credentials into `js/config.js` ✅ DONE

`js/config.js` now contains your real `SUPABASE_URL` and the modern publishable key (`sb_publishable_…`). The anon key is safe to ship in the browser — it only allows what RLS policies permit. Never paste the `service_role` key anywhere; it stays on Supabase's servers.

If you ever need to recover them: Supabase Dashboard → Settings → API.

---

## 3. Make yourself admin (do this *after* signing up)

1. Open `index.html` in a browser, click **Develop Your Family Tree**, and sign up with your email + password. (You may need to click the confirmation link Supabase sends to your inbox — check the **Auth → Email** settings in Supabase to disable that requirement if you'd rather skip it for now.)
2. Back in the Supabase SQL editor, run:

```sql
update public.profiles set is_admin = true
where email = 'your-signup-email@example.com';
```

Now the **⚙ Admin** link in the top-right of the landing page will let you see every registered user's profile and tree.

---

## You're done

- `index.html` — public landing (the hero auto-plays the demo family)
- `signup.html` — signup / login / forgot password
- `profile.html` — basic info form (step 1 of new-user flow)
- `dashboard.html` — user's home after login
- `tree-edit.html` — kinship editor with the **+** badge per portrait
- `tree-view.html` — read-only chart with download-to-JPG
- `details.html` — six-tab extended profile editor (contact, cultural, professional, historical, media, medical)
- `superadmin.html` — site admin's view of every user

## Hosting it online (free)

You're already on Netlify (per `netlify.toml`). Push to your repo and Netlify auto-deploys. You'll get a `your-app.netlify.app` URL with HTTPS, free forever. A custom domain (e.g. `yourfamily.com`) costs ~$10–15/year — the *only* thing in this entire stack that costs money.

## What lives where

- **User accounts + tree data** → Supabase Postgres (`profiles` table)
- **Uploaded photos** → Supabase Storage (`photos` bucket, public-read)
- **Sessions** → Supabase Auth (managed automatically; persisted in localStorage)
- **Demo data on the landing hero** → still hardcoded in `js/data.js` (not in the database — it's intentionally separate so the marketing demo never changes)

## Free-tier limits to know

| Limit | What it covers |
|---|---|
| 50,000 monthly active users | Way more than you'll ever hit early |
| 500 MB Postgres database | Fits thousands of trees easily |
| 1 GB photo storage | ~20,000 photos at the app's auto-resized 50 KB each |
| 5 GB photo bandwidth/month | Cached aggressively in browsers, plenty in practice |
| Project pauses after 7 days idle | Unpauses automatically on next request (5-second cold start) |

## Forgot-password flow

Already wired. Click **Forgot your password?** on the login screen → Supabase emails a reset link → user clicks it → goes to a Supabase-hosted reset page → enters new password → comes back signed in.

## Next steps you might want

These aren't required for "fully functional" — they're polish:

1. **Custom domain** ($10–15/year — optional)
2. **Sentry free tier** for error monitoring (drop in one script tag)
3. **Cloudflare Web Analytics** for page-view stats (drop in one script tag)
4. **Privacy policy + terms** (use [getterms.io](https://getterms.io) free generator)
5. **GDPR delete-my-account button** (one query, easy to add)
6. **Server-side image resize via Supabase Edge Function** (lets you accept any file size and resize on the server instead of the browser — only matters at scale)
