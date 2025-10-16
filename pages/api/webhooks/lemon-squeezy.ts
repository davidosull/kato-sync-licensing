import { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { LemonSqueezyWebhook } from '@/types';
import { verifyWebhookSignature } from '@/lib/utils';
import {
  createLicense,
  updateLicense,
  createSubscriptionEvent,
} from '@/lib/supabase';
import {
  calculateExpiryDate,
  getOrder,
  getSubscription,
} from '@/lib/lemon-squeezy';

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

    // Handle different event types
    switch (eventName) {
      case 'order_created':
        await handleOrderCreated(webhook);
        break;

      case 'subscription_created':
        await handleSubscriptionCreated(webhook);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(webhook);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(webhook);
        break;

      case 'subscription_payment_success':
        await handlePaymentSuccess(webhook);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(webhook);
        break;

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Log the event
    const evt = await createSubscriptionEvent({
      license_key: '', // Will be populated by specific handlers
      event_type: eventName,
      event_data: webhook,
      created_at: new Date().toISOString(),
    });
    console.log('[LS Webhook] Event logged to Supabase', { success: !!evt });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOrderCreated(webhook: LemonSqueezyWebhook) {
  const order = webhook.data;

  try {
    // Get order details from Lemon Squeezy API
    const orderDetails = await getOrder(order.id);
    console.log('[LS Webhook] Loaded order details', {
      order_id: order.id,
      email: orderDetails?.attributes?.user_email,
      order_items_count:
        orderDetails?.relationships?.['order-items']?.data?.length,
    });

    // Extract license key from order
    // Lemon Squeezy includes license keys in the order items when license key generation is enabled
    const orderItems = orderDetails.relationships['order-items'].data;
    if (orderItems.length === 0) return;

    // Get the first order item (assuming single item orders)
    const orderItemId = orderItems[0].id;

    // Fetch order item details to get license key
    const orderItemResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/order-items/${orderItemId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
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
      return;
    }

    const orderItemData = await orderItemResponse.json();
    const orderItem = orderItemData.data;
    console.log('[LS Webhook] Order item loaded', {
      variant_id: orderItem?.attributes?.variant_id,
      variant_name: orderItem?.attributes?.variant_name,
      product_name: orderItem?.attributes?.product_name,
      identifier: orderItem?.attributes?.identifier,
      has_product_options: !!orderItem?.attributes?.product_options,
      has_custom_data: !!orderItem?.attributes?.custom_data,
    });

    // Extract license key from order item
    // License keys are typically in the product_options or custom_data
    const licenseKey =
      orderItem.attributes.product_options?.license_key ||
      orderItem.attributes.custom_data?.license_key ||
      orderItem.attributes.identifier; // Fallback to order identifier
    console.log('[LS Webhook] Derived license key', {
      licenseKey_present: !!licenseKey,
    });

    // Derive tier and billing cycle from names to support test/live without hardcoded IDs
    const variantId = String(orderItem.attributes.variant_id);
    const variantName: string = orderItem.attributes.variant_name || '';
    const productName: string = orderItem.attributes.product_name || '';

    // Normalise tier from product/variant names
    const lowerName = `${productName} ${variantName}`.toLowerCase();
    let tier: 'freelancer' | 'agency' | 'unlimited' = 'freelancer';
    if (lowerName.includes('agency')) tier = 'agency';
    else if (
      lowerName.includes('enterprise') ||
      lowerName.includes('unlimited')
    )
      tier = 'unlimited';

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
  } catch (error) {
    console.error('Error handling order_created:', error);
  }
}

async function handleSubscriptionCreated(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    // Load subscription to access related order and fields
    const sub = await getSubscription(subscription.id);

    const orderId = String(sub.attributes.order_id);
    const orderItemId = String(sub.attributes.order_item_id);
    const customerEmail = sub.attributes.user_email;

    // Fetch order details
    const orderDetails = await getOrder(orderId);

    // Prefer provided order_item_id; fallback to first item
    let resolvedOrderItemId = orderItemId;
    if (!resolvedOrderItemId) {
      const items = orderDetails.relationships['order-items']?.data || [];
      resolvedOrderItemId = items.length ? items[0].id : '';
    }

    if (!resolvedOrderItemId) {
      console.error(
        '[LS Webhook] No order item id available for subscription_created',
        { orderId }
      );
      return;
    }

    // Fetch order item to extract licence key and product metadata
    const orderItemResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/order-items/${resolvedOrderItemId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    );

    if (!orderItemResponse.ok) {
      console.error(
        '[LS Webhook] Failed to fetch order item for subscription_created',
        {
          order_item_id: resolvedOrderItemId,
          status: orderItemResponse.status,
          statusText: orderItemResponse.statusText,
        }
      );
      return;
    }

    const orderItemData = await orderItemResponse.json();
    const orderItem = orderItemData.data;

    const licenseKey =
      orderItem.attributes.product_options?.license_key ||
      orderItem.attributes.custom_data?.license_key ||
      orderItem.attributes.identifier;

    const variantId = String(orderItem.attributes.variant_id);
    const variantName: string = orderItem.attributes.variant_name || '';
    const productName: string = orderItem.attributes.product_name || '';
    const lowerName = `${productName} ${variantName}`.toLowerCase();

    let tier: 'freelancer' | 'agency' | 'unlimited' = 'freelancer';
    if (lowerName.includes('agency')) tier = 'agency';
    else if (
      lowerName.includes('enterprise') ||
      lowerName.includes('unlimited')
    )
      tier = 'unlimited';

    const billingCycle: 'monthly' | 'annual' = lowerName.includes('annual')
      ? 'annual'
      : 'monthly';
    const expiresAt = calculateExpiryDate(billingCycle);

    // Attempt to create licence (idempotent by unique constraint on license_key if present)
    const created = await createLicense({
      license_key: licenseKey,
      order_id: orderId,
      variant_id: variantId,
      customer_email: customerEmail,
      status: 'active',
      tier: tier as any,
      billing_cycle: billingCycle as any,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      subscription_id: subscription.id,
    });

    if (!created) {
      // If create failed (e.g. exists), try updating with subscription id
      await updateLicense(licenseKey, {
        subscription_id: subscription.id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
      });
    }

    console.log('[LS Webhook] subscription_created processed', {
      license_key: licenseKey ? 'present' : 'missing',
      created: !!created,
    });
  } catch (error) {
    console.error('Error handling subscription_created:', error);
  }
}

async function handleSubscriptionUpdated(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    const subscriptionDetails = await getSubscription(subscription.id);

    const licenseKey = subscriptionDetails.attributes.user_email; // Adjust based on your setup

    await updateLicense(licenseKey, {
      expires_at: new Date(
        subscriptionDetails.attributes.renews_at
      ).toISOString(),
    });

    console.log(`Updated license expiry for subscription ${subscription.id}`);
  } catch (error) {
    console.error('Error handling subscription_updated:', error);
  }
}

async function handleSubscriptionCancelled(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    const subscriptionDetails = await getSubscription(subscription.id);

    const licenseKey = subscriptionDetails.attributes.user_email; // Adjust based on your setup

    await updateLicense(licenseKey, {
      status: 'cancelled',
    });

    console.log(`Cancelled license for subscription ${subscription.id}`);
  } catch (error) {
    console.error('Error handling subscription_cancelled:', error);
  }
}

async function handlePaymentSuccess(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    const subscriptionDetails = await getSubscription(subscription.id);

    const licenseKey = subscriptionDetails.attributes.user_email; // Adjust based on your setup

    await updateLicense(licenseKey, {
      status: 'active',
      expires_at: new Date(
        subscriptionDetails.attributes.renews_at
      ).toISOString(),
    });

    console.log(`Payment successful for subscription ${subscription.id}`);
  } catch (error) {
    console.error('Error handling payment_success:', error);
  }
}

async function handlePaymentFailed(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    const subscriptionDetails = await getSubscription(subscription.id);

    const licenseKey = subscriptionDetails.attributes.user_email; // Adjust based on your setup

    // Don't immediately expire - give grace period
    console.log(
      `Payment failed for subscription ${subscription.id}, license will expire on ${subscriptionDetails.attributes.ends_at}`
    );
  } catch (error) {
    console.error('Error handling payment_failed:', error);
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
