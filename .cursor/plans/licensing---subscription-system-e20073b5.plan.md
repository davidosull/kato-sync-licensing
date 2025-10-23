<!-- e20073b5-82a5-459c-8d9f-347f8ece3f5d adb853c0-2331-47dc-8ebd-74f9c49cb31f -->

# KatoSync Licensing & Subscription System Implementation

## Overview

Build a complete licensing system integrating Lemon Squeezy (payments), Vercel (licensing server), Supabase (database), and WordPress plugin with automatic updates from S3. Focus on smooth UX from purchase to activation.

## Architecture

### Components

1. **Licensing Server** (Vercel + Node.js) - API for license validation, activation, and webhook processing
2. **Database** (Supabase) - Store licenses, activations, and subscription status
3. **WordPress Plugin** - License validation, update checks, and sync gating
4. **Marketing Site** - Dynamic pricing from Lemon Squeezy, purchase flow
5. **S3 Bucket** - Plugin distribution and update serving

## Phase 1: Licensing Server Setup

### 1.1 Project Initialization

Create new Next.js/Node.js project in `kato-sync-licencing`:

- Initialize with TypeScript
- Set up Vercel deployment config
- Configure environment variables (Lemon Squeezy API keys, Supabase credentials, signing secret)

### 1.2 Supabase Database Schema

Create tables:

- `licenses` - license_key, order_id, variant_id, customer_email, status (active/expired/cancelled), tier (freelancer/agency/unlimited), billing_cycle (monthly/annual), created_at, expires_at, subscription_id
- `activations` - id, license_key, site_url, site_domain, activated_at, last_checked_at, is_local (boolean)
- `subscription_events` - id, license_key, event_type, event_data, created_at

Set up indexes on license_key and site_domain for fast lookups.

### 1.3 API Endpoints

Build REST API routes:

- `POST /api/activate` - Activate license on a site (checks tier limits, allows unlimited local)
- `POST /api/deactivate` - Deactivate license from site
- `POST /api/validate` - Check if license is valid for site (daily checks from plugin)
- `GET /api/license/:key` - Get license details and activation list
- `POST /api/webhooks/lemon-squeezy` - Handle subscription events (created, updated, cancelled, payment failed)
- `GET /api/update-check` - Return plugin version info for WordPress update checks

### 1.4 License Key Management

- Generate license keys in Lemon Squeezy (enable license key feature on products)
- Store in Supabase when webhook fires on order creation
- Map Lemon Squeezy variant IDs to tier limits (1, 5, unlimited)

### 1.5 Local Environment Detection

Check site_url for: localhost, .local, .test, .dev, 127.0.0.1, ::1, 192.168.x.x, 10.x.x.x

Mark activation as `is_local = true` (doesn't count toward tier limits)

## Phase 2: Lemon Squeezy Configuration

### 2.1 Product Setup

Create 3 products in Lemon Squeezy (or 6 variants under 1 product):

- Freelancer Monthly ($9) + Annual ($90)
- Agency Monthly ($32) + Annual ($320)
- Unlimited Monthly ($45) + Annual ($450)

Enable license key generation on all products.

Attach plugin zip file to products for customer download access.

### 2.2 Webhook Configuration

Set up webhook in Lemon Squeezy dashboard:

- Point to `https://your-licensing-server.vercel.app/api/webhooks/lemon-squeezy`
- Subscribe to: `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_success`, `subscription_payment_failed`
- Verify webhook signature in endpoint handler

### 2.3 Customer Portal

Lemon Squeezy provides built-in customer portal (handles receipts, downloads, subscription management).

No custom account area needed for v1 - customers access via LS portal.

## Phase 3: WordPress Plugin Integration

### 3.1 License Management UI

Create new admin page `includes/Admin/Pages/LicensePage.php`:

- Input field for license key
- "Activate License" button
- Display license status (tier, expiry date, sites used)
- List of activated sites with deactivate buttons
- Link to purchase if no license

Add menu item in `includes/Admin/Admin.php`.

### 3.2 License Validation Class

Create `includes/Licensing/LicenseManager.php`:

- `activate($license_key)` - Call licensing server to activate
- `validate()` - Daily check with licensing server (cache result for 24h)
- `deactivate()` - Remove activation from server
- `get_status()` - Return current license status (active, expired, grace_period, invalid)
- `is_grace_period()` - Check if within 7-day grace after expiry
- `get_grace_days_remaining()` - Calculate days left in grace period

Store license key and status in wp_options:

- `kato_sync_license_key`
- `kato_sync_license_status`
- `kato_sync_license_data` (JSON with tier, expiry, last_check)

### 3.3 Sync Gating

Modify `includes/Sync/SyncManager.php`:

- Check license status before manual/auto sync
- During grace period: allow syncs but show warning notice
- After grace period: block syncs with error message and reactivation link
- Keep existing imported data accessible (read-only mode)

Update `auto_sync()` and sync UI to respect license status.

### 3.4 Admin Notices

Create `includes/Licensing/Notices.php`:

- Active license: no notice
- Grace period (days 1-7): yellow notice "Your subscription expired X days ago. Syncs will stop in Y days. Renew now"
- Expired (day 8+): red notice "Your subscription has expired. New syncs are disabled. Renew to continue importing properties"
- No license: info notice "Activate your license to start syncing properties"

Display on all KatoSync admin pages.

### 3.5 Plugin Updates System

Create `includes/Licensing/UpdateManager.php`:

- Hook into `pre_set_site_transient_update_plugins` filter
- Check licensing server for updates: `GET /api/update-check?version={current}&license={key}`
- Return update info if newer version available
- On update download, verify license is valid (can be expired, just needs to exist)
- If expired: show notice "License expired - updates allowed but syncing disabled until renewed"

Use standard WordPress update UI - no custom update interface needed.

### 3.6 Download URL

Store S3 download URL in licensing server response.

Format: `https://your-bucket.s3.region.amazonaws.com/kato-sync-latest.zip?signature={token}`

Generate short-lived signed URLs (15 min expiry) in UpdateManager when WP requests download.

## Phase 4: Marketing Site Integration

### 4.1 Dynamic Pricing API

Create serverless function in marketing site (or call licensing server):

`/api/pricing` - Fetch prices from Lemon Squeezy API

- Cache for 24 hours
- Return all 6 variants with prices, variant_ids, checkout URLs

### 4.2 Update Pricing Component

Modify `src/components/layout/Pricing.js`:

- Fetch from `/api/pricing` on component mount
- Show loading state during fetch
- Fallback to hardcoded prices if API fails
- Update "Buy Now" buttons to use Lemon Squeezy checkout URLs with variant IDs

### 4.3 Purchase Flow

Click "Buy Now" → Lemon Squeezy checkout → Complete payment → Customer receives:

1. Email receipt with license key and download link
2. Access to customer portal for future downloads
3. Webhook triggers license creation in Supabase

Simple, handled by Lemon Squeezy - no custom flow needed.

## Phase 5: S3 Distribution Setup

### 5.1 S3 Bucket Configuration

- Create public bucket or use CloudFront
- Upload `kato-sync-latest.zip` (plugin zip file)
- Create `version.json` with current version number and changelog
- Set CORS if needed for direct browser downloads

### 5.2 Update Endpoint Logic

Licensing server `GET /api/update-check`:

- Read version.json from S3
- Compare with requested version
- Return update available flag, download URL, version number
- Only respond to requests with valid license keys (active or expired)

### 5.3 Automated Build & Distribution Process

**Plugin Build Script** (`npm run dist`):

Create Node.js build script in plugin: `/kato-sync/scripts/build-dist.js`

1. Read version from `kato-sync.php` header
2. Run `npm run build` (Vite production build)
3. Create temp directory with production files:

   - Copy: `includes/`, `dist/`, `vendor/`, `kato-sync.php`, `composer.json`, `README.md`
   - Exclude: `src/`, `node_modules/`, `scripts/`, dev configs (use .gitattributes patterns)

4. Create zip: `kato-sync-{version}.zip` (e.g., `kato-sync-1.1.0.zip`)
5. Output to `/builds/` directory (gitignored)
6. Print success message with filename and next steps

Add to `package.json`:

```json
"scripts": {
  "dist": "node scripts/build-dist.js"
}
```

**Upload Process**:

1. Run `npm run dist` locally
2. Upload generated zip to S3 with version number: `s3://bucket/kato-sync-1.1.0.zip`
3. Copy/update `kato-sync-latest.zip` to point to new version
4. Update `version.json` with new version number and changelog
5. Add versioned zip link to changelog page on marketing site

**Benefits**:

- Consistent, repeatable builds
- Version number automatically matches plugin header
- No manual file selection errors
- Ready for future automation (GitHub Actions)

Later enhancement: GitHub Actions workflow on release tag.

## Phase 6: Testing & Launch Checklist

### 6.1 License Activation Flow

- [ ] Purchase test product in Lemon Squeezy sandbox
- [ ] Verify webhook creates license in Supabase
- [ ] Activate license in WP plugin on production domain
- [ ] Activate on local domain (should work, not count toward limit)
- [ ] Try activating beyond tier limit (should fail with clear error)
- [ ] Deactivate from WP admin
- [ ] Reactivate (should succeed)

### 6.2 Sync Gating

- [ ] Active license: syncs work
- [ ] Expired license day 1-7: syncs work + warning shown
- [ ] Expired license day 8+: syncs blocked + error shown
- [ ] No license: syncs blocked + activation prompt shown
- [ ] Existing data accessible in all scenarios

### 6.3 Updates

- [ ] New version in S3 shows in WP updates
- [ ] Active license: update works
- [ ] Expired license: update works (with notice)
- [ ] No license: update blocked
- [ ] Version number displayed correctly

### 6.4 Pricing

- [ ] Marketing site shows correct prices from LS
- [ ] Cached responses work
- [ ] Buy buttons link to correct checkout
- [ ] Purchase flow completes successfully

### 6.5 Edge Cases

- [ ] License expired during sync (should complete, then block next sync)
- [ ] Network failure during validation (use cached status)
- [ ] Deactivated remotely (next check detects, shows message)
- [ ] Changed domain (requires new activation)

## Technical Notes

### Security

- Verify Lemon Squeezy webhook signatures
- Rate limit activation/validation endpoints
- Use HTTPS everywhere
- Don't expose license validation logic in frontend
- Short-lived S3 signed URLs for downloads

### Performance

- Cache license validation for 24h in WP
- Cache pricing for 24h in marketing site
- Use Vercel edge functions for low latency
- Index Supabase tables properly

### UX Priorities

1. Instant access after purchase (LS email with key + download)
2. Clear activation process in plugin
3. Helpful notices during grace period
4. Easy reactivation path
5. Smooth update experience

## Files to Create/Modify

### New Files (Licensing Server)

- `/kato-sync-licencing/package.json`
- `/kato-sync-licencing/vercel.json`
- `/kato-sync-licencing/api/activate.ts`
- `/kato-sync-licencing/api/deactivate.ts`
- `/kato-sync-licencing/api/validate.ts`
- `/kato-sync-licencing/api/license/[key].ts`
- `/kato-sync-licencing/api/webhooks/lemon-squeezy.ts`
- `/kato-sync-licencing/api/update-check.ts`
- `/kato-sync-licencing/lib/supabase.ts`
- `/kato-sync-licencing/lib/lemon-squeezy.ts`
- `/kato-sync-licencing/lib/utils.ts`
- `/kato-sync-licencing/types/index.ts`

### New Files (WordPress Plugin)

- `/kato-sync/includes/Licensing/LicenseManager.php`
- `/kato-sync/includes/Licensing/UpdateManager.php`
- `/kato-sync/includes/Licensing/Notices.php`
- `/kato-sync/includes/Admin/Pages/LicensePage.php`

### Modified Files (WordPress Plugin)

- `/kato-sync/includes/Plugin.php` - Register licensing hooks
- `/kato-sync/includes/Admin/Admin.php` - Add license menu
- `/kato-sync/includes/Sync/SyncManager.php` - Add license checks
- `/kato-sync/kato-sync.php` - Update version, add license constants

### New Files (Marketing Site)

- `/kato-sync-marketing/src/api/pricing.js` or serverless function

### Modified Files (Marketing Site)

- `/kato-sync-marketing/src/components/layout/Pricing.js` - Dynamic pricing
- `/kato-sync-marketing/netlify.toml` - Add serverless function config if using Netlify functions

## Environment Variables Needed

### Licensing Server (Vercel)

```
LEMON_SQUEEZY_API_KEY=xxx
LEMON_SQUEEZY_SIGNING_SECRET=xxx
SUPABASE_URL=xxx
SUPABASE_KEY=xxx
S3_BUCKET_NAME=xxx
S3_REGION=xxx
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
```

### Marketing Site (Netlify)

```
LEMON_SQUEEZY_API_KEY=xxx (read-only for pricing)
```

## Post-Launch Enhancements (Future)

- Custom customer account area on marketing site
- Automated plugin deployment pipeline
- Usage analytics in licensing server
- Email notifications for expiring licenses
- Upgrade/downgrade tier functionality
- License transfer between sites
- Multi-site network support

### To-dos

- [ ] Initialize licensing server project with Next.js/Vercel, TypeScript, and dependencies
- [ ] Create Supabase database schema (licenses, activations, subscription_events tables)
- [ ] Build licensing server API endpoints (activate, validate, deactivate, update-check)
- [ ] Implement Lemon Squeezy webhook handler for subscription events
- [ ] Configure Lemon Squeezy products, variants, pricing, and webhook
- [ ] Create WordPress plugin LicenseManager class with activation/validation logic
- [ ] Build license management admin page in WordPress plugin
- [ ] Add license checks to sync functionality with grace period support
- [ ] Implement admin notices for license status (grace period, expired, etc.)
- [ ] Create UpdateManager class for WordPress plugin updates via S3
- [ ] Build dynamic pricing API endpoint for marketing site
- [ ] Update marketing site Pricing component to fetch and display dynamic prices
- [ ] Set up S3 bucket for plugin distribution and version management
- [ ] Complete end-to-end testing of purchase flow, activation, syncing, and updates
