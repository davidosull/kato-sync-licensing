// Database types
export interface License {
  id: string;
  license_key: string;
  order_id: string;
  variant_id: string;
  customer_email: string;
  status: 'active' | 'expired' | 'cancelled';
  tier: 'freelancer' | 'agency' | 'enterprise';
  billing_cycle: 'monthly' | 'annual';
  created_at: string;
  expires_at: string;
  subscription_id?: string;
}

export interface Activation {
  id: string;
  license_key: string;
  site_url: string;
  site_domain: string;
  activated_at: string;
  last_checked_at: string;
  is_local: boolean;
}

export interface SubscriptionEvent {
  id: string;
  license_key: string;
  event_type: string;
  event_data: any;
  created_at: string;
}

// API request/response types
export interface ActivateRequest {
  license_key: string;
  site_url: string;
}

export interface ActivateResponse {
  success: boolean;
  message: string;
  license?: License;
  activations?: Activation[];
  // Tier limit error fields
  tier_limit_reached?: boolean;
  current_tier?: string;
  current_activations?: number;
  tier_limit?: number;
  upgrade_available?: boolean;
}

export interface ValidateRequest {
  license_key: string;
  site_url: string;
}

export interface ValidateResponse {
  valid: boolean;
  status: 'active' | 'expired' | 'grace_period' | 'invalid';
  grace_days_remaining?: number;
  license?: License;
}

export interface DeactivateRequest {
  license_key: string;
  site_url: string;
}

export interface DeactivateResponse {
  success: boolean;
  message: string;
}

export interface UpdateCheckRequest {
  version: string;
  license_key: string;
}

export interface UpdateCheckResponse {
  update_available: boolean;
  latest_version?: string;
  download_url?: string;
  changelog?: string;
}

// Lemon Squeezy types
export interface LemonSqueezyWebhook {
  meta: {
    event_name: string;
    custom_data?: any;
  };
  data: {
    type: string;
    id: string;
    attributes: any;
    relationships?: any;
  };
}

// Tier limits
export const TIER_LIMITS = {
  freelancer: 1,
  agency: 5,
  enterprise: -1, // -1 means unlimited
} as const;

export type TierType = keyof typeof TIER_LIMITS;
