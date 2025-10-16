import { LemonSqueezyWebhook } from '@/types';

export interface LemonSqueezyProduct {
  id: string;
  type: string;
  attributes: {
    name: string;
    slug: string;
    price: number;
    status: string;
    created_at: string;
    updated_at: string;
  };
}

export interface LemonSqueezyVariant {
  id: string;
  type: string;
  attributes: {
    name: string;
    slug: string;
    price: number;
    status: string;
    created_at: string;
    updated_at: string;
  };
}

export interface LemonSqueezyOrder {
  id: string;
  type: string;
  attributes: {
    store_id: number;
    customer_id: number;
    identifier: string;
    order_number: number;
    user_name: string;
    user_email: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  relationships: {
    'order-items': {
      data: Array<{
        type: string;
        id: string;
      }>;
    };
    'license-keys'?: {
      data: Array<{
        type: string;
        id: string;
      }>;
    };
  };
}

export interface LemonSqueezySubscription {
  id: string;
  type: string;
  attributes: {
    store_id: number;
    customer_id: number;
    order_id: number;
    order_item_id: number;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_name: string;
    user_name: string;
    user_email: string;
    status: string;
    status_formatted: string;
    card_brand: string;
    card_last_four: string;
    pause: any;
    cancelled: boolean;
    trial_ends_at: any;
    billing_anchor: number;
    created_at: string;
    updated_at: string;
    ends_at: any;
    renews_at: string;
  };
}

// Map Lemon Squeezy variant IDs to tiers
export const VARIANT_TIER_MAP: Record<
  string,
  { tier: string; billing_cycle: string }
> = {
  // Actual Lemon Squeezy variant IDs for KatoSync product (ID: 657642)
  '1032742': { tier: 'freelancer', billing_cycle: 'annual' },
  '1032736': { tier: 'freelancer', billing_cycle: 'monthly' },
  '1032737': { tier: 'agency', billing_cycle: 'annual' },
  '1032738': { tier: 'agency', billing_cycle: 'monthly' },
  '1032739': { tier: 'unlimited', billing_cycle: 'annual' },
  '1032740': { tier: 'unlimited', billing_cycle: 'monthly' },
};

export function getTierFromVariantId(
  variantId: string
): { tier: string; billing_cycle: string } | null {
  return VARIANT_TIER_MAP[variantId] || null;
}

export function calculateExpiryDate(
  billingCycle: string,
  startDate: Date = new Date()
): Date {
  const expiryDate = new Date(startDate);

  if (billingCycle === 'monthly') {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  } else if (billingCycle === 'annual') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  }

  return expiryDate;
}

export async function fetchLemonSqueezyData(
  endpoint: string,
  apiKeyOverride?: string
): Promise<any> {
  const apiKey = apiKeyOverride || process.env.LEMON_SQUEEZY_API_KEY;

  if (!apiKey) {
    throw new Error('Lemon Squeezy API key not configured');
  }

  const response = await fetch(`https://api.lemonsqueezy.com/v1${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Lemon Squeezy API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export async function getProducts(
  apiKeyOverride?: string
): Promise<LemonSqueezyProduct[]> {
  const data = await fetchLemonSqueezyData('/products', apiKeyOverride);
  return data.data || [];
}

export async function getVariants(
  apiKeyOverride?: string
): Promise<LemonSqueezyVariant[]> {
  const data = await fetchLemonSqueezyData('/variants', apiKeyOverride);
  return data.data || [];
}

export async function getOrder(
  orderId: string,
  apiKeyOverride?: string
): Promise<LemonSqueezyOrder> {
  const data = await fetchLemonSqueezyData(
    `/orders/${orderId}?include=order-items`,
    apiKeyOverride
  );
  return data.data;
}

export async function getSubscription(
  subscriptionId: string,
  apiKeyOverride?: string
): Promise<LemonSqueezySubscription> {
  const data = await fetchLemonSqueezyData(
    `/subscriptions/${subscriptionId}`,
    apiKeyOverride
  );
  return data.data;
}
