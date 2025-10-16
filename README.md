# KatoSync Licensing Server

A Next.js API server for managing KatoSync WordPress plugin licenses, built for deployment on Vercel.

## Features

- License activation and validation
- Subscription management via Lemon Squeezy webhooks
- Site activation limits per tier
- Local environment detection (unlimited activations)
- Grace period handling (7 days after expiry)
- Plugin update checks

## Setup

### 1. Environment Variables

Create a `.env.local` file with:

```env
LEMON_SQUEEZY_API_KEY=your_api_key
LEMON_SQUEEZY_SIGNING_SECRET=your_signing_secret
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
S3_BUCKET_NAME=your_bucket_name
S3_REGION=your_region
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
```

### 2. Database Setup

Run the SQL schema in `supabase-schema.sql` in your Supabase SQL editor.

### 3. Lemon Squeezy Configuration

1. Create products with variants for each tier:

   - Freelancer Monthly ($9) + Annual ($90)
   - Agency Monthly ($32) + Annual ($320)
   - Enterprise Monthly ($45) + Annual ($450)

2. Enable license key generation on all products

3. Set up webhook pointing to: `https://your-domain.vercel.app/api/webhooks/lemon-squeezy`

4. Subscribe to events: `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_success`, `subscription_payment_failed`

### 4. Update Variant Mapping

Update the `VARIANT_TIER_MAP` in `lib/lemon-squeezy.ts` with your actual Lemon Squeezy variant IDs.

## API Endpoints

### POST /api/activate

Activate a license on a site.

**Request:**

```json
{
  "license_key": "license-key-here",
  "site_url": "https://example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "License activated successfully",
  "license": { ... },
  "activations": [ ... ]
}
```

### POST /api/validate

Validate a license for a site.

**Request:**

```json
{
  "license_key": "license-key-here",
  "site_url": "https://example.com"
}
```

**Response:**

```json
{
  "valid": true,
  "status": "active",
  "license": { ... }
}
```

### POST /api/deactivate

Deactivate a license from a site.

**Request:**

```json
{
  "license_key": "license-key-here",
  "site_url": "https://example.com"
}
```

### GET /api/license/[key]

Get license details and activations.

### GET /api/update-check

Check for plugin updates.

**Query Parameters:**

- `version`: Current plugin version
- `license_key`: License key

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

### Environment Variables in Vercel

Set these in your Vercel project settings:

- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_SIGNING_SECRET`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `S3_BUCKET_NAME`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

## Development

```bash
npm install
npm run dev
```

## License Tiers

- **Freelancer**: 1 site activation
- **Agency**: 5 site activations
- **Enterprise**: Unlimited site activations

Local environments (localhost, .local, .test, .dev, etc.) don't count toward activation limits.

## Grace Period

When a subscription expires, users have a 7-day grace period where:

- Syncs continue to work
- Warning notices are shown
- After 7 days, syncs are blocked

## Security

- Webhook signatures are verified
- License keys are validated on each request
- Rate limiting should be implemented in production
- Use HTTPS everywhere
