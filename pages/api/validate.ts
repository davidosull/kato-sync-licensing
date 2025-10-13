import { NextApiRequest, NextApiResponse } from 'next';
import { ValidateRequest, ValidateResponse } from '@/types';
import { getLicense, updateActivationCheck } from '@/lib/supabase';
import { getLicenseStatus, getGracePeriodDays } from '@/lib/utils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ValidateResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      valid: false,
      status: 'invalid',
    });
  }

  try {
    const { license_key, site_url }: ValidateRequest = req.body;

    if (!license_key || !site_url) {
      return res.status(400).json({
        valid: false,
        status: 'invalid',
      });
    }

    // Get license from database
    const license = await getLicense(license_key);

    if (!license) {
      return res.status(200).json({
        valid: false,
        status: 'invalid',
      });
    }

    // Update last checked time for this activation
    await updateActivationCheck(license_key, site_url);

    // Determine license status
    const status = getLicenseStatus(license);

    const response: ValidateResponse = {
      valid: status === 'active' || status === 'grace_period',
      status,
      license,
    };

    // Add grace period info if applicable
    if (status === 'grace_period') {
      response.grace_days_remaining = getGracePeriodDays(license.expires_at);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      valid: false,
      status: 'invalid',
    });
  }
}
