import { NextApiRequest, NextApiResponse } from 'next';
import { DeactivateRequest, DeactivateResponse } from '@/types';
import { getLicense, removeActivation, getActivations } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeactivateResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    const { license_key, site_url }: DeactivateRequest = req.body;

    if (!license_key || !site_url) {
      return res.status(400).json({
        success: false,
        message: 'License key and site URL are required',
      });
    }

    // Verify license exists
    const license = await getLicense(license_key);

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found',
      });
    }

    // Remove activation
    const success = await removeActivation(license_key, site_url);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to deactivate license',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'License deactivated successfully',
    });
  } catch (error) {
    console.error('Deactivation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
