# Database Keep-Alive Implementation

## Overview

This implementation prevents your Supabase database from being deactivated due to inactivity on the free plan. The system automatically performs a lightweight database query every 2 days to keep the database active.

## How It Works

1. **Keep-Alive Endpoint**: `/api/keep-alive` performs a simple `SELECT` query on the `licenses` table
2. **Vercel Cron Job**: Automatically calls the endpoint every 2 days at 12:00 UTC
3. **Lightweight Query**: Only selects the `id` field with a limit of 1 row - minimal resource usage

## Files Added

- `api/keep-alive.ts` - The keep-alive endpoint
- `scripts/test-keepalive.sh` - Test script for local development
- `vercel.json` - Updated with cron configuration

## Cron Schedule

The cron job runs every 2 days at 12:00 UTC:

```
"0 12 */2 * *"
```

This means:

- `0` - At minute 0
- `12` - At hour 12 (12:00 UTC)
- `*/2` - Every 2nd day
- `*` - Every month
- `*` - Every day of the week

## Testing

### Local Testing

1. Start your development server:

   ```bash
   npm run dev
   ```

2. Run the test script:

   ```bash
   ./scripts/test-keepalive.sh
   ```

3. Or manually test:
   ```bash
   curl http://localhost:3000/api/keep-alive
   ```

### Production Testing

After deploying to Vercel, you can test the endpoint:

```bash
curl https://your-domain.vercel.app/api/keep-alive
```

## Monitoring

### Vercel Dashboard

1. Go to your Vercel dashboard
2. Select your project
3. Go to the "Functions" tab
4. Look for cron job executions in the logs

### Response Format

**Success Response:**

```json
{
  "success": true,
  "message": "Database keep-alive successful",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "data": "Database is active"
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Database query failed",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## Troubleshooting

### Common Issues

1. **Cron job not running**: Check Vercel dashboard for cron job status
2. **Database connection errors**: Verify Supabase environment variables
3. **Permission errors**: Ensure the endpoint is accessible publicly

### Environment Variables Required

Make sure these are set in your Vercel environment:

- `SUPABASE_URL`
- `SUPABASE_KEY`

## Cost Considerations

- **Vercel Cron Jobs**: Free tier includes 2 cron jobs
- **Database Queries**: Minimal cost - only 1 lightweight query every 2 days
- **Function Executions**: Very low cost due to infrequent execution

## Alternative Schedules

If you need different timing, modify the cron schedule in `vercel.json`:

- Every day: `"0 12 * * *"`
- Every 3 days: `"0 12 */3 * *"`
- Twice daily: `"0 6,18 * * *"`

## Security

The endpoint is designed to be safe:

- Only performs read operations
- No sensitive data is returned
- Minimal database impact
- Publicly accessible (required for cron jobs)
