---
name: DB push command
description: How to run drizzle-kit push in this project — DATABASE_URL is a dead Supabase URL; must override with PG* vars
---

The drizzle.config.ts reads `DATABASE_URL`, but that env var holds an old Supabase `https://` URL (unreachable). The actual database is Replit's built-in PostgreSQL reachable via PG* variables.

**How to apply:** Always run db:push like this:

```bash
DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE}" npm run db:push
```

**Why:** The server's `supabase.ts` ignores DATABASE_URL when it doesn't start with `postgres(ql)://` and falls back to building a connection string from PGUSER/PGPASSWORD/PGHOST/PGDATABASE. drizzle-kit always uses DATABASE_URL directly, so it hits the dead Supabase host unless overridden.
