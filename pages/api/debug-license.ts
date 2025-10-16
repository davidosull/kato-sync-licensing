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
      return res.status(400).json({ error: 'License key required' });
    }

    const license = await getLicense(license_key);

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    // Return safe diagnostic info
    return res.status(200).json({
      found: true,
      tier: license.tier,
      billing_cycle: license.billing_cycle,
      status: license.status,
      has_subscription_id: !!license.subscription_id,
      subscription_id: license.subscription_id || null,
      created_at: license.created_at,
      expires_at: license.expires_at,
    });
  } catch (error) {
    console.error('Debug license error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

