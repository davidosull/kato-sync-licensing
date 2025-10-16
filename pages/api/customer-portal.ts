import { NextApiRequest, NextApiResponse } from 'next';
import { getLicense } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { license_key } = req.body;

    if (!license_key) {
      return res.status(400).json({ error: 'License key is required' });
    }

    // Get license from database
    const license = await getLicense(license_key);

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    // If no subscription_id, return fallback to pricing page
    if (!license.subscription_id) {
      return res.status(200).json({
        has_portal: false,
        fallback_url: 'https://katosync.com/pricing',
        message: 'This license is not associated with a subscription',
      });
    }

    // Fetch subscription details from Lemon Squeezy to get customer portal URL
    const apiKey =
      process.env.LEMON_SQUEEZY_API_KEY ||
      process.env.LEMON_SQUEEZY_API_KEY_TEST;

    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${license.subscription_id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to fetch subscription ${license.subscription_id}`,
        response.status,
        response.statusText
      );
      return res.status(200).json({
        has_portal: false,
        fallback_url: 'https://katosync.com/pricing',
        message: 'Unable to fetch subscription details',
      });
    }

    const subscriptionData = await response.json();
    const subscription = subscriptionData.data;

    // Extract customer portal URL
    const portalUrl = subscription.attributes.urls?.customer_portal;

    if (!portalUrl) {
      return res.status(200).json({
        has_portal: false,
        fallback_url: 'https://katosync.com/pricing',
        message: 'Customer portal URL not available',
      });
    }

    return res.status(200).json({
      has_portal: true,
      portal_url: portalUrl,
      subscription: {
        status: subscription.attributes.status,
        renews_at: subscription.attributes.renews_at,
        ends_at: subscription.attributes.ends_at,
      },
    });
  } catch (error) {
    console.error('Error fetching customer portal:', error);
    return res.status(500).json({
      error: 'Internal server error',
      fallback_url: 'https://katosync.com/pricing',
    });
  }
}
