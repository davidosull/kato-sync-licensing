# Environment Variables Migration Guide

## Overview
This guide helps you migrate from the old environment variable names to the new industry-standard names.

## Changes Made

### Supabase Variables
- `SUPABASE_KEY` → `SUPABASE_ANON_KEY`

### AWS S3 Variables
- `S3_BUCKET_NAME` → `AWS_S3_BUCKET`
- `S3_REGION` → `AWS_REGION`
- `S3_ACCESS_KEY` → `AWS_ACCESS_KEY_ID`
- `S3_SECRET_KEY` → `AWS_SECRET_ACCESS_KEY`

### Lemon Squeezy Variables
- Added: `LEMON_SQUEEZY_STORE_ID`

## Migration Steps

### 1. Vercel Environment Variables
Update your Vercel environment variables:

```bash
# Add new variables (keep old ones temporarily)
SUPABASE_ANON_KEY=<same value as SUPABASE_KEY>
AWS_S3_BUCKET=kato-sync-plugin-distribution
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=<same value as S3_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<same value as S3_SECRET_KEY>
LEMON_SQUEEZY_STORE_ID=<your-store-id>
```

### 2. Test the Changes
1. Deploy to Vercel
2. Test API endpoints:
   - `GET /api/validate?license_key=test123`
   - `GET /api/update-check?version=0.8.0&license_key=test123`

### 3. Remove Old Variables (After Testing)
Once confirmed working, remove:
- `SUPABASE_KEY`
- `S3_BUCKET_NAME`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

## Rollback Plan
If issues occur, revert by:
1. Adding back old variable names
2. Reverting code changes
3. Redeploying

## Files Updated
- `lib/supabase.ts`
- `lib/utils.ts`
- `api/update-check.ts`
- `api/keep-alive.js`
- `api/test-connection.js`
- `api/keep-alive-simple.ts`
- `api/diagnostics.ts`
