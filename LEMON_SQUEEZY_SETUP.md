# Lemon Squeezy Configuration Guide

## Overview

This guide covers the complete setup of Lemon Squeezy for KatoSync, including product configuration, license key generation, and webhook setup.

## Product Configuration

### Current Setup

- **Product Name**: KatoSync
- **Product ID**: 657642
- **Store**: davido-builds.lemonsqueezy.com

### Variants Created

| Tier       | Billing | Variant ID | Price |
| ---------- | ------- | ---------- | ----- |
| Freelancer | Annual  | 1032742    | $90   |
| Freelancer | Monthly | 1032736    | $9    |
| Agency     | Annual  | 1032737    | $320  |
| Agency     | Monthly | 1032738    | $32   |
| Unlimited  | Annual  | 1032739    | $450  |
| Unlimited  | Monthly | 1032740    | $45   |

## License Key Configuration

### Enable License Key Generation

For each variant, you need to enable license key generation:

1. **Go to Products** in Lemon Squeezy dashboard
2. **Click on KatoSync product**
3. **For each variant**:
   - Click "Edit" on the variant
   - Scroll to "License Keys" section
   - **Enable "Generate license keys"**
   - Set license key format (recommended: `KATO-{random}`)
   - Save changes

### License Key Format Options

- `KATO-{random}` - Generates keys like KATO-ABC123
- `{random}` - Generates random strings
- Custom format with your preferred prefix

## Webhook Configuration

### Set Up Webhook

1. **Go to Settings > Webhooks** in Lemon Squeezy dashboard
2. **Click "Create Webhook"**
3. **Configure webhook**:
   - **URL**: `https://your-licensing-server.vercel.app/api/webhooks/lemon-squeezy`
   - **Events**: Select all subscription-related events:
     - `order_created`
     - `subscription_created`
     - `subscription_updated`
     - `subscription_cancelled`
     - `subscription_payment_success`
     - `subscription_payment_failed`
   - **Secret**: Generate a strong secret (save this for environment variables)

### Webhook Events Explained

- **`order_created`**: Triggers when customer completes purchase

  - Creates license in database
  - Maps variant to tier
  - Sets expiry date based on billing cycle

- **`subscription_created`**: Triggers when subscription is first created

  - Updates license with subscription ID
  - Sets renewal date

- **`subscription_updated`**: Triggers when subscription changes

  - Updates expiry date
  - Handles plan changes

- **`subscription_cancelled`**: Triggers when subscription is cancelled

  - Marks license as cancelled
  - License enters grace period

- **`subscription_payment_success`**: Triggers on successful payment

  - Reactivates license if it was expired
  - Updates expiry date

- **`subscription_payment_failed`**: Triggers on failed payment
  - License enters grace period
  - Customer gets warning notices

## Customer Experience

### Purchase Flow

1. Customer visits pricing page
2. Selects billing cycle (Monthly/Annual)
3. Clicks "Buy Now" on desired tier
4. Redirected to Lemon Squeezy checkout for specific variant
5. Completes payment
6. Receives email with:
   - License key
   - Download link for plugin
   - Access to customer portal

### Customer Portal

Lemon Squeezy provides built-in customer portal where customers can:

- View all orders and subscriptions
- Download plugin files
- Manage subscription (pause, cancel, update payment)
- View license keys
- Access receipts

## Testing

### Test Purchase Flow

1. **Use Lemon Squeezy test mode** (if available)
2. **Make test purchase** with each variant
3. **Verify webhook fires** and creates license in database
4. **Check email delivery** with license key
5. **Test license activation** in WordPress plugin

### Test Webhook Delivery

1. **Check webhook logs** in Lemon Squeezy dashboard
2. **Monitor licensing server logs** for webhook processing
3. **Verify database records** are created correctly
4. **Test webhook signature verification**

## Environment Variables

### Licensing Server (Vercel)

```
LEMON_SQUEEZY_API_KEY=your_api_key
LEMON_SQUEEZY_SIGNING_SECRET=your_webhook_secret
```

### Marketing Site (Netlify)

```
LEMON_SQUEEZY_API_KEY=your_api_key
```

## API Integration

### Pricing API

The marketing site fetches pricing from Lemon Squeezy API:

- **Endpoint**: `https://api.lemonsqueezy.com/v1/variants`
- **Caching**: 24 hours
- **Fallback**: Hardcoded prices if API fails

### Checkout URLs

Direct checkout URLs for each variant:

- Freelancer Annual: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032742`
- Freelancer Monthly: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032736`
- Agency Annual: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032737`
- Agency Monthly: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032738`
- Unlimited Annual: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032739`
- Unlimited Monthly: `https://davido-builds.lemonsqueezy.com/checkout/buy/1032740`

## Troubleshooting

### Common Issues

**License keys not generating:**

- Check license key generation is enabled on each variant
- Verify license key format is set
- Test with a new purchase

**Webhook not firing:**

- Check webhook URL is correct and accessible
- Verify webhook secret matches
- Check Lemon Squeezy webhook logs
- Test webhook endpoint manually

**Pricing not updating:**

- Check Lemon Squeezy API key is valid
- Verify variant IDs are correct
- Check API rate limits
- Test API endpoint manually

**Checkout URLs not working:**

- Verify variant IDs are correct
- Check store URL format
- Test URLs in browser

### Debug Steps

1. **Check webhook delivery** in Lemon Squeezy dashboard
2. **Monitor licensing server logs** for errors
3. **Test API endpoints** individually
4. **Verify database records** are created
5. **Check email delivery** for license keys

## Next Steps

After successful setup:

1. **Test complete purchase flow** end-to-end
2. **Monitor webhook delivery** for first few purchases
3. **Verify license activation** works correctly
4. **Check customer portal** functionality
5. **Monitor for any errors** in logs

## Support

For Lemon Squeezy specific issues:

- Check Lemon Squeezy documentation
- Contact Lemon Squeezy support
- Review webhook delivery logs
- Test API endpoints manually
