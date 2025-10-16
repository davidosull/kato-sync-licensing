import { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { LemonSqueezyWebhook } from '@/types';
import { verifyWebhookSignature } from '@/lib/utils';
import {
  createLicense,
  updateLicense,
  upsertLicense,
  createSubscriptionEvent,
} from '@/lib/supabase';
import {
  calculateExpiryDate,
  getOrder,
  getSubscription,
} from '@/lib/lemon-squeezy';

// Helper: resolve license key for an order via included license-keys
async function resolveLicenseKeyByOrderId(
  orderId: string,
  apiKeyOverride?: string
): Promise<string | null> {
  try {
    const orderData: any = await fetch(
      `https://api.lemonsqueezy.com/v1/orders/${orderId}?include=license-keys`,
      {
        headers: {
          Authorization: `Bearer ${
            apiKeyOverride || process.env.LEMON_SQUEEZY_API_KEY
          }`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    ).then((r) => r.json());

    const included = orderData?.included || [];
    const lk = included.find((i: any) => i.type === 'license-keys');
    return lk?.attributes?.key || null;
  } catch (e) {
    console.error('[LS Webhook] Failed to resolve license key by order id', {
      orderId,
      error: e,
    });
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    console.warn('[LS Webhook] Non-POST request received');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Early receipt log (before any verification)
    console.log('[LS Webhook] Received webhook request');

    const signature = (req.headers['x-signature'] ||
      req.headers['X-Signature']) as string;
    const signingSecret = process.env.LEMON_SQUEEZY_SIGNING_SECRET || '';
    const signingSecretTest =
      process.env.LEMON_SQUEEZY_SIGNING_SECRET_TEST || '';

    if (!signature) {
      console.error('[LS Webhook] Missing signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify webhook signature using RAW body (bodyParser disabled in route config)
    const rawPayload = await getRawBody(req);
    const payload = rawPayload.toString('utf8');
    const isValidLive = signingSecret
      ? verifyWebhookSignature(payload, signature, signingSecret)
      : false;
    const isValidTest = signingSecretTest
      ? verifyWebhookSignature(payload, signature, signingSecretTest)
      : false;
    const isValid = isValidLive || isValidTest;
    console.log('[LS Webhook] Signature validation result', {
      isValid,
      isValidLive,
      isValidTest,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse JSON from raw body only after signature check
    const webhook: LemonSqueezyWebhook = JSON.parse(payload);
    const eventName = webhook.meta.event_name;

    console.log(`Processing Lemon Squeezy webhook: ${eventName}`, {
      data_type: webhook.data?.type,
      data_id: webhook.data?.id,
    });

    // Choose LS API key depending on whether this was validated by test or live secret
    const apiKeyOverride = isValidTest
      ? process.env.LEMON_SQUEEZY_API_KEY_TEST
      : process.env.LEMON_SQUEEZY_API_KEY;

    // Handle different event types
    let resolvedLicenseKey: string | null = null;
    switch (eventName) {
      case 'order_created':
        resolvedLicenseKey = await handleOrderCreated(webhook, apiKeyOverride);
        break;

      case 'license_key_created':
        resolvedLicenseKey = await handleLicenseKeyCreated(
          webhook,
          apiKeyOverride
        );
        break;

      case 'subscription_created':
        resolvedLicenseKey = await handleSubscriptionCreated(
          webhook,
          apiKeyOverride
        );
        break;

      case 'subscription_updated':
        resolvedLicenseKey = await handleSubscriptionUpdated(
          webhook,
          apiKeyOverride
        );
        break;

      case 'subscription_cancelled':
        resolvedLicenseKey = await handleSubscriptionCancelled(
          webhook,
          apiKeyOverride
        );
        break;

      case 'subscription_payment_success':
        resolvedLicenseKey = await handlePaymentSuccess(
          webhook,
          apiKeyOverride
        );
        break;

      case 'subscription_payment_failed':
        resolvedLicenseKey = await handlePaymentFailed(webhook, apiKeyOverride);
        break;

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Log the event (only if we have a license_key to reference)
    // For license_key_created events, use the key from the webhook data
    const licenseKeyForEvent =
      resolvedLicenseKey ||
      (eventName === 'license_key_created'
        ? (webhook as any)?.data?.attributes?.key
        : (webhook as any)?.data?.attributes?.license_key);

    if (licenseKeyForEvent) {
      const evt = await createSubscriptionEvent({
        license_key: licenseKeyForEvent,
        event_type: eventName,
        event_data: webhook,
        created_at: new Date().toISOString(),
      });
      console.log('[LS Webhook] Event logged to Supabase', {
        success: !!evt,
        event_type: eventName,
      });
    } else {
      console.log(
        '[LS Webhook] Skipping event log (no license_key available)',
        {
          event_type: eventName,
        }
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleLicenseKeyCreated(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const licenseKeyData = webhook.data;

  try {
    console.log('[LS Webhook] Processing license_key_created', {
      license_key_id: licenseKeyData.id,
      order_id: licenseKeyData.attributes.order_id,
    });

    // Extract license key details from webhook data
    const licenseKey = licenseKeyData.attributes.key;
    const orderId = String(licenseKeyData.attributes.order_id);
    const variantId = String(licenseKeyData.attributes.product_id); // We'll need to fetch proper variant
    const customerEmail = licenseKeyData.attributes.user_email;

    console.log('[LS Webhook] License key details', {
      key: licenseKey ? licenseKey.substring(0, 8) + '...' : null,
      order_id: orderId,
      customer_email: customerEmail,
      status: licenseKeyData.attributes.status,
      activation_limit: licenseKeyData.attributes.activation_limit,
    });

    // Fetch order to get variant and product details
    const orderItemId = String(licenseKeyData.attributes.order_item_id);
    const orderItemResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/order-items/${orderItemId}`,
      {
        headers: {
          Authorization: `Bearer ${
            apiKeyOverride || process.env.LEMON_SQUEEZY_API_KEY
          }`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    );

    if (!orderItemResponse.ok) {
      console.error(`[LS Webhook] Failed to fetch order item ${orderItemId}`, {
        status: orderItemResponse.status,
        statusText: orderItemResponse.statusText,
      });
      return null;
    }

    const orderItemData = await orderItemResponse.json();
    const orderItem = orderItemData.data;

    // Derive tier and billing cycle from product/variant names
    const actualVariantId = String(orderItem.attributes.variant_id);
    const variantName: string = orderItem.attributes.variant_name || '';
    const productName: string = orderItem.attributes.product_name || '';

    const lowerName = `${productName} ${variantName}`.toLowerCase();
    let tier: 'freelancer' | 'agency' | 'enterprise' = 'freelancer';
    if (lowerName.includes('agency')) tier = 'agency';
    else if (
      lowerName.includes('enterprise') ||
      lowerName.includes('unlimited')
    )
      tier = 'enterprise';

    const billingCycle: 'monthly' | 'annual' = lowerName.includes('annual')
      ? 'annual'
      : 'monthly';

    // Calculate expiry date
    const expiresAt = calculateExpiryDate(billingCycle);

    // Use upsert to create or update license in database
    // This handles cases where order_created might have tried to create it first
    const upserted = await upsertLicense({
      license_key: licenseKey,
      order_id: orderId,
      variant_id: actualVariantId,
      customer_email: customerEmail,
      status: 'active',
      tier: tier as any,
      billing_cycle: billingCycle as any,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    console.log(
      '[LS Webhook] License upserted from license_key_created event',
      {
        success: !!upserted,
        license_key: licenseKey ? licenseKey.substring(0, 8) + '...' : null,
        tier,
        billing_cycle: billingCycle,
      }
    );
    return licenseKey || null;
  } catch (error) {
    console.error('[LS Webhook] Error handling license_key_created:', error);
    return null;
  }
}

async function handleOrderCreated(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const order = webhook.data;

  try {
    // Get order details from Lemon Squeezy API (includes order-items and license-keys)
    const orderResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/orders/${order.id}?include=order-items,license-keys`,
      {
        headers: {
          Authorization: `Bearer ${
            apiKeyOverride || process.env.LEMON_SQUEEZY_API_KEY
          }`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    );

    if (!orderResponse.ok) {
      console.error('[LS Webhook] Failed to fetch order', {
        order_id: order.id,
        status: orderResponse.status,
        statusText: orderResponse.statusText,
      });
      return null;
    }

    const orderData = await orderResponse.json();
    const orderDetails = orderData.data;

    // DIAGNOSTIC: Log the full response structure including 'included' resources
    console.log('[LS Webhook] Full order API response', {
      order_id: order.id,
      has_data: !!orderData.data,
      has_included: !!orderData.included,
      included_count: orderData.included?.length || 0,
      included_types: orderData.included?.map((item: any) => item.type) || [],
    });

    // Log any license keys found in the included array
    const includedLicenseKeys =
      orderData.included?.filter((item: any) => item.type === 'license-keys') ||
      [];

    if (includedLicenseKeys.length > 0) {
      console.log('[LS Webhook] License keys found in included array', {
        count: includedLicenseKeys.length,
        license_keys: includedLicenseKeys.map((lk: any) => ({
          id: lk.id,
          key: lk.attributes?.key,
          status: lk.attributes?.status,
        })),
      });
    }

    // Diagnostic: log full response structure
    console.log('[LS Webhook] Order API response structure', {
      order_id: order.id,
      has_relationships: !!orderDetails.relationships,
      relationships_keys: orderDetails.relationships
        ? Object.keys(orderDetails.relationships)
        : [],
      order_items_exists: !!orderDetails.relationships?.['order-items'],
      order_items_data_type:
        typeof orderDetails.relationships?.['order-items']?.data,
      order_items_data: orderDetails.relationships?.['order-items']?.data,
      license_keys_exists: !!orderDetails.relationships?.['license-keys'],
      license_keys_data_type:
        typeof orderDetails.relationships?.['license-keys']?.data,
      license_keys_data: orderDetails.relationships?.['license-keys']?.data,
    });

    console.log('[LS Webhook] Loaded order details', {
      order_id: order.id,
      email: orderDetails?.attributes?.user_email,
      order_items_count:
        orderDetails?.relationships?.['order-items']?.data?.length,
    });

    // Extract license key from order
    // Lemon Squeezy includes license keys in the order items when license key generation is enabled
    const orderItems = orderDetails.relationships?.['order-items']?.data;
    if (!orderItems || orderItems.length === 0) {
      console.error('[LS Webhook] No order items found', {
        order_id: order.id,
      });
      return null;
    }

    // Get the first order item (assuming single item orders)
    const orderItemId = orderItems[0].id;

    // Fetch order item details to get license key
    const orderItemResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/order-items/${orderItemId}`,
      {
        headers: {
          Authorization: `Bearer ${
            apiKeyOverride || process.env.LEMON_SQUEEZY_API_KEY
          }`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    );

    if (!orderItemResponse.ok) {
      console.error(`Failed to fetch order item ${orderItemId}`, {
        status: orderItemResponse.status,
        statusText: orderItemResponse.statusText,
      });
      return null;
    }

    const orderItemData = await orderItemResponse.json();
    const orderItem = orderItemData.data;
    console.log('[LS Webhook] Order item loaded', {
      variant_id: orderItem?.attributes?.variant_id,
      variant_name: orderItem?.attributes?.variant_name,
      product_name: orderItem?.attributes?.product_name,
      identifier: orderItem?.attributes?.identifier,
      has_product_options: !!orderItem?.attributes?.product_options,
      product_options: orderItem?.attributes?.product_options,
      has_custom_data: !!orderItem?.attributes?.custom_data,
      custom_data: orderItem?.attributes?.custom_data,
      has_relationships: !!orderItem?.relationships,
      relationships_keys: orderItem?.relationships
        ? Object.keys(orderItem?.relationships)
        : [],
    });

    // Extract license key from the included array (JSON:API format)
    // The relationships contain references, but actual data is in the 'included' array
    let licenseKey = null;

    if (includedLicenseKeys.length > 0) {
      // Get the first license key
      const licenseKeyData = includedLicenseKeys[0];
      licenseKey = licenseKeyData.attributes?.key;

      console.log('[LS Webhook] License key extracted from included array', {
        licenseKey_present: !!licenseKey,
        license_key_id: licenseKeyData.id,
        status: licenseKeyData.attributes?.status,
        activation_limit: licenseKeyData.attributes?.activation_limit,
        licenseKey_value: licenseKey
          ? licenseKey.substring(0, 8) + '...'
          : null,
      });
    } else {
      console.log('[LS Webhook] No license keys found in included array', {
        order_id: order.id,
      });
    }

    // If still no license key, try legacy methods as fallback
    if (!licenseKey) {
      licenseKey =
        orderItem.attributes.product_options?.license_key ||
        orderItem.attributes.custom_data?.license_key ||
        orderItem.attributes.identifier;

      console.log('[LS Webhook] Tried fallback license key extraction', {
        licenseKey_present: !!licenseKey,
        source: orderItem.attributes.product_options?.license_key
          ? 'product_options'
          : orderItem.attributes.custom_data?.license_key
          ? 'custom_data'
          : orderItem.attributes.identifier
          ? 'identifier'
          : 'none',
      });
    }

    // Derive tier and billing cycle from names to support test/live without hardcoded IDs
    const variantId = String(orderItem.attributes.variant_id);
    const variantName: string = orderItem.attributes.variant_name || '';
    const productName: string = orderItem.attributes.product_name || '';

    // Normalise tier from product/variant names
    const lowerName = `${productName} ${variantName}`.toLowerCase();
    let tier: 'freelancer' | 'agency' | 'enterprise' = 'freelancer';
    if (lowerName.includes('agency')) tier = 'agency';
    else if (
      lowerName.includes('enterprise') ||
      lowerName.includes('unlimited')
    )
      tier = 'enterprise';

    // Determine billing cycle from variant naming
    const billingCycle: 'monthly' | 'annual' = lowerName.includes('annual')
      ? 'annual'
      : 'monthly';

    // Calculate expiry date
    const expiresAt = calculateExpiryDate(billingCycle);

    // Create license
    const created = await createLicense({
      license_key: licenseKey,
      order_id: order.id,
      variant_id: variantId,
      customer_email: orderDetails.attributes.user_email,
      status: 'active',
      tier: tier as any,
      billing_cycle: billingCycle as any,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    console.log('[LS Webhook] License insert result', {
      success: !!created,
      license_key: licenseKey,
    });
    return licenseKey || null;
  } catch (error) {
    console.error('Error handling order_created:', error);
    return null;
  }
}

async function handleSubscriptionCreated(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const subscription = webhook.data;

  try {
    console.log('[LS Webhook] Processing subscription_created', {
      subscription_id: subscription.id,
    });

    const sub = await getSubscription(subscription.id, apiKeyOverride);
    const orderId = String(sub.attributes.order_id);

    console.log('[LS Webhook] Fetched subscription details', {
      subscription_id: subscription.id,
      order_id: orderId,
      variant_name: sub.attributes.variant_name,
      status: sub.attributes.status,
    });

    const licenseKey = await resolveLicenseKeyByOrderId(
      orderId,
      apiKeyOverride
    );

    console.log('[LS Webhook] Resolved license key', {
      license_key_found: !!licenseKey,
      license_key: licenseKey ? licenseKey.substring(0, 8) + '...' : null,
    });

    if (!licenseKey) {
      console.warn(
        '[LS Webhook] subscription_created: could not resolve license key',
        { orderId }
      );
      return null;
    }

    const expiresAt = calculateExpiryDate(
      sub.attributes.variant_name?.toLowerCase().includes('annual')
        ? 'annual'
        : 'monthly'
    );

    const updated = await updateLicense(licenseKey, {
      subscription_id: subscription.id,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    });

    console.log('[LS Webhook] subscription_created: updated license', {
      license_key: licenseKey.substring(0, 8) + '...',
      subscription_id: subscription.id,
      update_success: !!updated,
    });

    return licenseKey;
  } catch (error) {
    console.error('Error handling subscription_created:', error);
    return null;
  }
}

async function handleSubscriptionUpdated(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const subscription = webhook.data;

  try {
    const sub = await getSubscription(subscription.id, apiKeyOverride);
    const orderId = String(sub.attributes.order_id);
    const licenseKey = await resolveLicenseKeyByOrderId(
      orderId,
      apiKeyOverride
    );

    if (!licenseKey) return null;

    await updateLicense(licenseKey, {
      expires_at: new Date(sub.attributes.renews_at).toISOString(),
    });

    console.log(`Updated license expiry for subscription ${subscription.id}`);
    return licenseKey;
  } catch (error) {
    console.error('Error handling subscription_updated:', error);
    return null;
  }
}

async function handleSubscriptionCancelled(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const subscription = webhook.data;

  try {
    const sub = await getSubscription(subscription.id, apiKeyOverride);
    const orderId = String(sub.attributes.order_id);
    const licenseKey = await resolveLicenseKeyByOrderId(
      orderId,
      apiKeyOverride
    );

    if (!licenseKey) return null;

    await updateLicense(licenseKey, {
      status: 'cancelled',
    });

    console.log(`Cancelled license for subscription ${subscription.id}`);
    return licenseKey;
  } catch (error) {
    console.error('Error handling subscription_cancelled:', error);
    return null;
  }
}

async function handlePaymentSuccess(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const invoice = webhook.data; // subscription-invoices

  try {
    const subscriptionId = String(
      (invoice as any)?.attributes?.subscription_id || invoice.id
    );
    const sub = await getSubscription(subscriptionId, apiKeyOverride);
    const orderId = String(sub.attributes.order_id);
    const licenseKey = await resolveLicenseKeyByOrderId(
      orderId,
      apiKeyOverride
    );

    if (!licenseKey) return null;

    await updateLicense(licenseKey, {
      status: 'active',
      expires_at: new Date(sub.attributes.renews_at).toISOString(),
    });

    console.log(`Payment successful for subscription ${subscriptionId}`);
    return licenseKey;
  } catch (error) {
    console.error('Error handling payment_success:', error);
    return null;
  }
}

async function handlePaymentFailed(
  webhook: LemonSqueezyWebhook,
  apiKeyOverride?: string
): Promise<string | null> {
  const invoice = webhook.data;

  try {
    const subscriptionId = String(
      (invoice as any)?.attributes?.subscription_id || invoice.id
    );
    const sub = await getSubscription(subscriptionId, apiKeyOverride);
    const orderId = String(sub.attributes.order_id);
    const licenseKey = await resolveLicenseKeyByOrderId(
      orderId,
      apiKeyOverride
    );

    console.log(
      `Payment failed for subscription ${subscriptionId}, license will expire on ${sub.attributes.ends_at}`
    );
    return licenseKey || null;
  } catch (error) {
    console.error('Error handling payment_failed:', error);
    return null;
  }
}

// Helper to read raw request body
async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Disable Next.js body parsing to preserve raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
