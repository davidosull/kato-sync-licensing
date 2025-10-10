import { NextApiRequest, NextApiResponse } from 'next';
import { LemonSqueezyWebhook } from '@/types';
import { verifyWebhookSignature } from '@/lib/utils';
import {
  createLicense,
  updateLicense,
  createSubscriptionEvent,
} from '@/lib/supabase';
import {
  getTierFromVariantId,
  calculateExpiryDate,
  getOrder,
  getSubscription,
} from '@/lib/lemon-squeezy';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['x-signature'] as string;
    const signingSecret = process.env.LEMON_SQUEEZY_SIGNING_SECRET!;

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(payload, signature, signingSecret);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook: LemonSqueezyWebhook = req.body;
    const eventName = webhook.meta.event_name;

    console.log(`Processing Lemon Squeezy webhook: ${eventName}`);

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
    await createSubscriptionEvent({
      license_key: '', // Will be populated by specific handlers
      event_type: eventName,
      event_data: webhook,
      created_at: new Date().toISOString(),
    });

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
      console.error(`Failed to fetch order item ${orderItemId}`);
      return;
    }

    const orderItemData = await orderItemResponse.json();
    const orderItem = orderItemData.data;

    // Extract license key from order item
    // License keys are typically in the product_options or custom_data
    const licenseKey =
      orderItem.attributes.product_options?.license_key ||
      orderItem.attributes.custom_data?.license_key ||
      orderItem.attributes.identifier; // Fallback to order identifier

    // Get variant ID from order item
    const variantId = orderItem.attributes.variant_id;
    const tierInfo = getTierFromVariantId(variantId);

    if (!tierInfo) {
      console.error(`Unknown variant ID: ${variantId}`);
      return;
    }

    // Calculate expiry date
    const expiresAt = calculateExpiryDate(tierInfo.billing_cycle);

    // Create license
    await createLicense({
      license_key: licenseKey,
      order_id: order.id,
      variant_id: variantId,
      customer_email: orderDetails.attributes.user_email,
      status: 'active',
      tier: tierInfo.tier as any,
      billing_cycle: tierInfo.billing_cycle as any,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    console.log(`Created license for order ${order.id}: ${licenseKey}`);
  } catch (error) {
    console.error('Error handling order_created:', error);
  }
}

async function handleSubscriptionCreated(webhook: LemonSqueezyWebhook) {
  const subscription = webhook.data;

  try {
    // Update license with subscription info
    const subscriptionDetails = await getSubscription(subscription.id);

    // Find license by customer email or order ID
    // This is a simplified approach - you might need to store the relationship differently
    const licenseKey = subscriptionDetails.attributes.user_email; // Adjust based on your setup

    await updateLicense(licenseKey, {
      subscription_id: subscription.id,
      status: 'active',
      expires_at: new Date(
        subscriptionDetails.attributes.renews_at
      ).toISOString(),
    });

    console.log(`Updated license with subscription ${subscription.id}`);
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
