# Stoneline UK — Project Management App
## Complete Setup & Deployment Guide

---

## What you're getting

A full web application with:
- ✅ Secure login for every team member
- ✅ Dashboard with live project overview
- ✅ Full project management (create, edit, track)
- ✅ Interactive colour-coded timeline (drag & drop)
- ✅ Task management with priorities, deadlines, assignees
- ✅ Team directory with workload view
- ✅ Document upload & management
- ✅ Reports with charts + Excel export
- ✅ AI Assistant (asks questions about live project data)
- ✅ In-app notifications
- ✅ Mobile responsive
- ✅ Excel import/export

---

## Step 1 — Create your Supabase project (FREE)

1. Go to **https://supabase.com** → Sign up (free)
2. Click **"New project"**
   - Name: `stoneline-uk`
   - Password: choose a strong password (save it!)
   - Region: **Europe West** (Ireland)
3. Wait ~2 minutes for setup
4. Go to **Settings → API** and copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → this is your `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Set up the database

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from this folder
4. Copy the entire contents and paste into the SQL editor
5. Click **"Run"** (or Ctrl+Enter)
6. You should see "Success. No rows returned"

---

## Step 3 — Deploy to Vercel (FREE)

### Option A: Deploy via GitHub (recommended)

1. Create a free account at **https://github.com**
2. Create a new repository called `stoneline-uk`
3. Upload all files from this folder to the repository
4. Go to **https://vercel.com** → Sign up with GitHub
5. Click **"Add New Project"** → Import your `stoneline-uk` repo
6. Under **"Environment Variables"**, add these 3 values:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJh...
   SUPABASE_SERVICE_ROLE_KEY    = eyJh...
   ```
7. Click **"Deploy"**
8. Wait ~2 minutes → your app is live at `https://stoneline-uk.vercel.app`

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
cd stoneline-uk
vercel
# Follow prompts, then add env variables in Vercel dashboard
```

---

## Step 4 — First login & admin setup

1. Open your app URL (e.g. `https://stoneline-uk.vercel.app`)
2. Click **"Request access"** and create your account
3. Check your email for a confirmation link
4. After confirming, log in
5. In Supabase SQL Editor, run this to make yourself admin:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'YOUR-EMAIL@stoneline.co.uk';
   ```
6. Refresh the app — you now have admin access

---

## Step 5 — Invite your team

As an admin, go to **Team → Invite member**

Or manually in Supabase → Authentication → Users → **"Invite user"**

Each person will receive an email with a login link.

---

## Step 6 — Set up email notifications (optional but recommended)

In Supabase → **Authentication → Email Templates**, customise:
- Confirm signup
- Reset password
- Magic Link

To enable real email (not just Supabase's built-in):
1. Go to **Settings → Auth → SMTP Settings**
2. Use a free service like **Resend.com** or **SendGrid**

---

## Custom domain (optional)

1. In Vercel → your project → **Settings → Domains**
2. Add: `projects.stoneline.co.uk`
3. Follow DNS instructions (add CNAME record in your domain registrar)

---

## Daily use

| Feature | Where |
|---------|-------|
| See today's tasks & alerts | Dashboard |
| Create a project | Projects → New project |
| Update project stage | Click project → click stage bar |
| View all milestones visually | Timeline |
| Add/complete tasks | Tasks or inside any project |
| Upload drawings & documents | Documents or inside a project |
| Ask AI questions | AI Assistant |
| Export weekly report | Reports → Export |
| Manage your profile | Settings |

---

## Technology stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password + magic links)
- **File storage**: Supabase Storage
- **Hosting**: Vercel (free tier)
- **AI**: Claude Sonnet (via Anthropic API)
- **Charts**: Recharts
- **Excel**: SheetJS

---

## Costs

| Service | Free tier | Paid |
|---------|-----------|------|
| Supabase | 500MB DB, 1GB storage, 50k users | $25/mo for more |
| Vercel | Unlimited deploys, custom domain | Free for teams <3 |
| AI Assistant | Needs Anthropic API key | ~$0.01 per question |

**Total monthly cost to run: £0** until you scale significantly.

---

## Adding AI Assistant API key (optional)

The AI Assistant works by calling the Anthropic API. To enable it:

1. Go to **https://console.anthropic.com** → Get API key
2. In Vercel → your project → Settings → Environment Variables
3. Add: `ANTHROPIC_API_KEY = sk-ant-...`
4. Redeploy

Without the key, the AI page will show a connection error.

---

## Support

If anything isn't working:
1. Check Supabase → Logs → API for database errors
2. Check Vercel → Deployments → your deploy → Function logs
3. Make sure all 3 environment variables are set correctly in Vercel

---

*Built for Stoneline UK · Powered by Next.js + Supabase + Vercel*
