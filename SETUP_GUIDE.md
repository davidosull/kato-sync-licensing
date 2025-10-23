# KatoSync Licensing System - Complete Setup Guide

## Overview

This guide covers the complete setup of the KatoSync licensing and subscription system, including:

- **Licensing Server** (Vercel + Next.js)
- **Database** (Supabase)
- **WordPress Plugin** (License validation & updates)
- **Marketing Site** (Dynamic pricing)
- **Payment Processing** (Lemon Squeezy)
- **Plugin Distribution** (S3)

## Prerequisites

- Vercel account
- Supabase account
- Lemon Squeezy account
- AWS S3 bucket
- Netlify account (for marketing site)

## Step 1: Supabase Database Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and API key

### 1.2 Run Database Schema

1. Go to SQL Editor in Supabase dashboard
2. Copy and run the contents of `kato-sync-licencing/supabase-schema.sql`
3. Verify tables are created: `licenses`, `activations`, `subscription_events`

## Step 2: Licensing Server Setup

### 2.1 Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard:
   ```
   LEMON_SQUEEZY_API_KEY=your_api_key
   LEMON_SQUEEZY_SIGNING_SECRET=your_signing_secret
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   S3_BUCKET_NAME=your_bucket_name
   S3_REGION=your_region
   S3_ACCESS_KEY=your_access_key
   S3_SECRET_KEY=your_secret_key
   ```
3. Deploy the project

### 2.2 Test API Endpoints

Test the deployed endpoints:

- `GET https://your-domain.vercel.app/api/update-check?version=1.0.0&license_key=test`
- `POST https://your-domain.vercel.app/api/activate` (with test data)

## Step 3: Lemon Squeezy Configuration

### 3.1 Create Products

Create 6 variants in Lemon Squeezy:

- Freelancer Monthly ($9)
- Freelancer Annual ($90)
- Agency Monthly ($32)
- Agency Annual ($320)
- Enterprise Monthly ($45)
- Enterprise Annual ($450)

### 3.2 Enable License Keys

1. Go to each product variant
2. Enable "License Key" feature
3. Note the variant IDs for mapping

### 3.3 Configure Webhook

1. Go to Settings > Webhooks in Lemon Squeezy
2. Add webhook URL: `https://your-licensing-server.vercel.app/api/webhooks/lemon-squeezy`
3. Subscribe to events:
   - `order_created`
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_payment_success`
   - `subscription_payment_failed`
4. Copy the signing secret

### 3.4 Update Variant Mapping

Update `kato-sync-licencing/lib/lemon-squeezy.ts`:

```typescript
export const VARIANT_TIER_MAP: Record<
  string,
  { tier: string; billing_cycle: string }
> = {
  'your-freelancer-monthly-variant-id': {
    tier: 'freelancer',
    billing_cycle: 'monthly',
  },
  'your-freelancer-annual-variant-id': {
    tier: 'freelancer',
    billing_cycle: 'annual',
  },
  // ... etc
};
```

## Step 4: WordPress Plugin Setup

### 4.1 Update License Server URL

Update `kato-sync/includes/Licensing/LicenseManager.php`:

```php
const LICENSE_SERVER_URL = 'https://your-licensing-server.vercel.app/api';
```

### 4.2 Update Update Manager URL

Update `kato-sync/includes/Licensing/UpdateManager.php`:

```php
const LICENSE_SERVER_URL = 'https://your-licensing-server.vercel.app/api';
```

### 4.3 Install Dependencies

```bash
cd kato-sync
npm install
```

### 4.4 Test License Management

1. Activate the plugin
2. Go to KatoSync > License
3. Test license activation with a test key

## Step 5: Marketing Site Setup

### 5.1 Deploy to Netlify

1. Connect your GitHub repository to Netlify
2. Set environment variable:
   ```
   LEMON_SQUEEZY_API_KEY=your_api_key
   ```
3. Deploy the site

### 5.2 Update Pricing Function

Update `netlify/functions/pricing.js`:

1. Update variant mapping with your actual variant IDs
2. Update checkout URL generation
3. Test the pricing endpoint: `https://your-site.netlify.app/.netlify/functions/pricing`

## Step 6: S3 Plugin Distribution

### 6.1 Create S3 Bucket

1. Create a public S3 bucket
2. Configure CORS if needed
3. Note bucket name and region

### 6.2 Upload Plugin Files

1. Run `npm run dist` in the plugin directory
2. Upload `kato-sync-latest.zip` to S3
3. Create `version.json`:
   ```json
   {
     "version": "1.1.0",
     "changelog": "Bug fixes and improvements"
   }
   ```

### 6.3 Test Update System

1. Update version in `kato-sync.php`
2. Run `npm run dist`
3. Upload new version to S3
4. Test update check in WordPress

## Step 7: End-to-End Testing

### 7.1 Purchase Flow

1. Go to marketing site pricing page
2. Click "Buy Now" on any plan
3. Complete purchase in Lemon Squeezy
4. Verify webhook creates license in Supabase
5. Check customer receives email with license key

### 7.2 License Activation

1. Install plugin on WordPress site
2. Go to KatoSync > License
3. Enter license key from email
4. Verify activation succeeds
5. Check license appears in Supabase activations

### 7.3 Sync Functionality

1. Configure feed URL in plugin settings
2. Test manual sync (should work with active license)
3. Test auto sync (should work with active license)
4. Let license expire and test grace period behavior
5. Test expired license blocks syncs

### 7.4 Plugin Updates

1. Create new plugin version
2. Upload to S3
3. Test update appears in WordPress dashboard
4. Test update works with active license
5. Test update works with expired license (with notice)

## Step 8: Production Checklist

### 8.1 Security

- [ ] All API keys are secure
- [ ] Webhook signatures are verified
- [ ] HTTPS used everywhere
- [ ] Rate limiting configured
- [ ] License validation is server-side only

### 8.2 Performance

- [ ] License validation cached for 24h
- [ ] Pricing cached for 24h
- [ ] Database indexes created
- [ ] CDN configured for S3 files

### 8.3 Monitoring

- [ ] Error logging configured
- [ ] Webhook delivery monitoring
- [ ] License activation tracking
- [ ] Update check monitoring

## Step 9: Launch

### 9.1 Soft Launch

1. Test with a few beta customers
2. Monitor webhook delivery
3. Check license activation success rate
4. Verify sync functionality works

### 9.2 Full Launch

1. Update marketing site with live pricing
2. Announce availability
3. Monitor system performance
4. Be ready to handle support requests

## Troubleshooting

### Common Issues

**Webhook not firing:**

- Check webhook URL is correct
- Verify signing secret matches
- Check Lemon Squeezy webhook logs

**License activation fails:**

- Check licensing server logs
- Verify Supabase connection
- Check license key format

**Pricing not updating:**

- Check Lemon Squeezy API key
- Verify variant mapping
- Check Netlify function logs

**Plugin updates not showing:**

- Check S3 file permissions
- Verify version.json format
- Check licensing server update endpoint

### Support

For issues with this implementation:

1. Check the relevant logs (Vercel, Netlify, Supabase)
2. Verify all environment variables are set
3. Test API endpoints individually
4. Check database for expected data

## Next Steps

After successful launch:

1. Monitor usage and performance
2. Gather customer feedback
3. Plan feature enhancements
4. Consider automated deployment pipeline
5. Add usage analytics
6. Implement customer account area
