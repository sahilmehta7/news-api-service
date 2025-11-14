# Quick Fix: Runtime Test Failure

## The Problem

Test fails with: `Unknown argument 'storyId'`

## The Solution

**Run this command:**

```bash
npm run prisma:generate
```

Then re-run the test:

```bash
npm run test:runtime-story
```

## Why This Happens

The Prisma schema has `storyId` but the Prisma client wasn't regenerated after adding the migration. The client needs to be regenerated to include new fields.

## Full Fix Steps

1. **Regenerate Prisma client:**
   ```bash
   npm run prisma:generate
   ```

2. **Verify migration is applied:**
   ```bash
   npx prisma migrate status
   ```
   
   If pending, apply:
   ```bash
   npx prisma migrate deploy
   ```

3. **Re-run test:**
   ```bash
   npm run test:runtime-story
   ```

## Expected Result

After regeneration, you should see:
- ✅ Elasticsearch Connection: Elasticsearch is accessible
- ✅ Elasticsearch Indices: Both indices exist
- ✅ Articles with Story IDs: Found X articles with storyIds
- ... (rest of tests)

## If Still Failing

Check:
1. Is migration applied? `npx prisma migrate status`
2. Is column in DB? Check with `psql` or Prisma Studio
3. Restart test script after regeneration

The code implementation is correct - this is just a Prisma client sync issue.

