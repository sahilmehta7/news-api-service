# Runtime Test Issue: Prisma Client Not Recognizing storyId

## Issue

The test failed with:
```
Unknown argument `storyId`. Available options are marked with ?.
```

## Root Cause

The Prisma schema has `storyId` field defined, but the Prisma client hasn't been regenerated after the migration was added. The Prisma client needs to be regenerated to include the new field.

## Solution

### Step 1: Regenerate Prisma Client

```bash
npm run prisma:generate
```

Or:
```bash
npx prisma generate
```

This will regenerate the Prisma client to include the `storyId` field.

### Step 2: Verify Migration Applied

```bash
npx prisma migrate status
```

If migration is pending, apply it:
```bash
npx prisma migrate deploy
```

### Step 3: Re-run Test

```bash
npm run test:runtime-story
```

## What Was Fixed

1. **Test Error Handling:**
   - Test now checks if `story_id` column exists in database
   - Test catches Prisma client errors and suggests regeneration
   - Better error messages with actionable steps

2. **Test Flow:**
   - First checks database column exists
   - Then tries Prisma query
   - Catches "Unknown argument" errors specifically
   - Provides clear fix instructions

## Expected Behavior After Fix

After running `npm run prisma:generate`, the test should:
- ✅ Recognize `storyId` field in Prisma queries
- ✅ Query articles with storyIds successfully
- ✅ Continue with full test suite

## Verification

After regenerating Prisma client:

```bash
# 1. Verify Prisma client generated
ls -la node_modules/.prisma/client/

# 2. Run test
npm run test:runtime-story

# 3. Should see:
# ✅ Articles with Story IDs: Found X articles with storyIds
```

## Quick Fix Command

```bash
# One command to fix:
npm run prisma:generate && npm run test:runtime-story
```

## If Issue Persists

1. **Check migration status:**
   ```bash
   npx prisma migrate status
   ```

2. **Apply pending migrations:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify schema:**
   ```bash
   grep -A 2 "storyId" prisma/schema.prisma
   ```

4. **Check database:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'articles' AND column_name = 'story_id';
   ```

## Summary

The implementation is correct. The issue is just that Prisma client needs regeneration. Run `npm run prisma:generate` and the test should pass.

