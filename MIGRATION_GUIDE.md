# Migration Guide: Google Sheets → Cloudflare D1

This guide walks you through migrating ChallengeMate from Google Sheets to Cloudflare D1 database.

## Overview

**Before:** Frontend → Cloudflare Worker → Google Sheets REST API  
**After:** Frontend → Cloudflare Worker → Cloudflare D1 (SQLite)

Benefits:
- ⚡ **10-50x faster** - D1 is optimized for Cloudflare's edge network
- 🔒 **Simpler auth** - No Google service account or OAuth setup
- 💰 **Lower cost** - D1 has generous free tier (5M rows, 5GB storage)
- 🛠️ **Easier maintenance** - Standard SQL instead of Sheets API quirks

## Prerequisites

1. **Cloudflare account** with Workers Paid plan ($5/month) - required for D1
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **Logged in**: `wrangler login`

## Step 1: Create D1 Database

```bash
# Create the database
wrangler d1 create challenge-mate

# Note the database_id from the output
```

You'll see output like:
```
✅ Successfully created DB 'challenge-mate'
database_id = "abc123-def456-..."
```

## Step 2: Update wrangler.toml

Replace `YOUR_D1_DATABASE_ID_HERE` in `wrangler.toml` with your actual database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "challenge-mate"
database_id = "abc123-def456-..."  # ← paste your ID here
```

## Step 3: Initialize Schema

```bash
# Create all tables
wrangler d1 execute challenge-mate --file=backend/schema.sql
```

This creates 13 tables:
- Users, Challenges, Members
- DailyTasks, Completions, Vacations
- Penalties, Achievements, UserAchievements
- NotificationSettings, FriendNotifications
- Invites, Announcements

## Step 4: Deploy Worker

```bash
wrangler deploy
```

Note your Worker URL (e.g., `https://challenge-mate.your-subdomain.workers.dev`)

## Step 5: Update Frontend

Edit `src/services/googleSheets.ts`:

```typescript
export const SHEETS_API_URL = "https://challenge-mate.your-subdomain.workers.dev";
```

Rebuild and deploy:

```bash
npm run build
git add .
git commit -m "Migrate to Cloudflare D1"
git push
```

## Step 6: Verify

1. Open your GitHub Pages site
2. Check Profile → Data source shows "Cloudflare D1 · live"
3. Create a test account
4. Verify data appears in D1:

```bash
wrangler d1 execute challenge-mate --command="SELECT * FROM Users"
```

## Step 7: Migrate Existing Data (Optional)

If you have existing data in Google Sheets:

### Option A: Manual Migration
1. Export your Sheets as CSV
2. Import via SQL INSERT statements

### Option B: Script Migration
Create a migration script that:
1. Reads from Google Sheets API
2. Inserts into D1 via Worker

Example structure:
```javascript
// migrate.js
const SHEETS_API_URL = "https://your-worker.workers.dev";

async function migrate() {
  // 1. Fetch from Sheets
  const users = await fetchFromSheets("Users");
  
  // 2. Insert to D1 via Worker
  for (const user of users) {
    await fetch(SHEETS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "register",
        payload: user
      })
    });
  }
}
```

## Step 8: Clean Up (Optional)

After confirming everything works:

1. **Remove Google Apps Script** from your Sheet
2. **Delete old Worker** (if you had one for Sheets)
3. **Revoke service account** access to your Sheet

## Troubleshooting

### "Database not found"
- Verify `database_id` in `wrangler.toml` matches `wrangler d1 list` output
- Run `wrangler d1 execute challenge-mate --command="SELECT 1"` to test connection

### "Table doesn't exist"
- Re-run schema: `wrangler d1 execute challenge-mate --file=backend/schema.sql`
- Check with: `wrangler d1 execute challenge-mate --command=".tables"`

### Worker deployment fails
- Ensure you're on Workers Paid plan (D1 requires paid plan)
- Check `wrangler.toml` syntax
- Run `wrangler tail` to see real-time logs

### Frontend shows "Local demo"
- Verify `SHEETS_API_URL` is set in `src/services/googleSheets.ts`
- Rebuild: `npm run build`
- Hard refresh browser (Ctrl+Shift+R)

## Performance Comparison

| Metric | Google Sheets | Cloudflare D1 |
|--------|---------------|---------------|
| Read latency | 200-500ms | 10-50ms |
| Write latency | 300-800ms | 20-60ms |
| Concurrent users | Limited by Sheets API | Unlimited (edge) |
| Cost (free tier) | Free | 5M rows free |
| Cost (paid) | N/A | $0.75/GB/month |

## Rollback Plan

If you need to revert to Google Sheets:

1. Restore `backend/worker.js` from git history
2. Update `wrangler.toml` (remove D1 binding)
3. Update `src/services/googleSheets.ts` with Sheets URL
4. Redeploy

## Support

- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [ChallengeMate Issues](https://github.com/yourusername/challengemate/issues)

---

**Migration complete!** 🎉

Your ChallengeMate app now runs on Cloudflare D1 with significantly better performance and simpler infrastructure.
