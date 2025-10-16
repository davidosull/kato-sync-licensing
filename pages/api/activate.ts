import { NextApiRequest, NextApiResponse } from 'next';
import { ActivateRequest, ActivateResponse } from '@/types';
import { getLicense, createActivation, getActivations } from '@/lib/supabase';
import {
  isLocalEnvironment,
  extractDomain,
  getTierLimit,
  getLicenseStatus,
} from '@/lib/utils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActivateResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    const { license_key, site_url }: ActivateRequest = req.body;

    if (!license_key || !site_url) {
      return res.status(400).json({
        success: false,
        message: 'License key and site URL are required',
      });
    }

    // Get license from database
    const license = await getLicense(license_key);

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found',
      });
    }

    // Check if license is valid
    const status = getLicenseStatus(license);
    if (status === 'invalid') {
      return res.status(400).json({
        success: false,
        message: 'License is invalid or cancelled',
      });
    }

    // Check if site is already activated
    const existingActivations = await getActivations(license_key);
    const isAlreadyActivated = existingActivations.some(
      (activation) => activation.site_url === site_url
    );

    if (isAlreadyActivated) {
      return res.status(200).json({
        success: true,
        message: 'Site already activated',
        license,
        activations: existingActivations,
      });
    }

    // Check tier limits (skip for local environments)
    const isLocal = isLocalEnvironment(site_url);
    if (!isLocal) {
      const tierLimit = getTierLimit(license.tier);
      const nonLocalActivations = existingActivations.filter(
        (activation) => !activation.is_local
      );

      if (tierLimit !== -1 && nonLocalActivations.length >= tierLimit) {
        // Determine upgrade tier
        const tierHierarchy: Record<string, { next: string; limit: number }> = {
          freelancer: { next: 'Agency', limit: 5 },
          agency: { next: 'Enterprise', limit: -1 },
        };

        const upgradeInfo = tierHierarchy[license.tier];
        const upgradeMessage = upgradeInfo
          ? ` Upgrade to ${upgradeInfo.next} for ${
              upgradeInfo.limit === -1 ? 'unlimited' : upgradeInfo.limit
            } sites.`
          : '';

        return res.status(400).json({
          success: false,
          message: `License tier limit reached. You're using ${nonLocalActivations.length} of ${tierLimit} allowed site${
            tierLimit === 1 ? '' : 's'
          } on the ${
            license.tier.charAt(0).toUpperCase() + license.tier.slice(1)
          } plan.${upgradeMessage}`,
          tier_limit_reached: true,
          current_tier: license.tier,
          current_activations: nonLocalActivations.length,
          tier_limit: tierLimit,
          upgrade_available: !!upgradeInfo,
        });
      }
    }

    // Create activation
    const activation = await createActivation({
      license_key,
      site_url,
      site_domain: extractDomain(site_url),
      activated_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      is_local: isLocal,
    });

    if (!activation) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create activation',
      });
    }

    // Get updated activations list
    const updatedActivations = await getActivations(license_key);

    return res.status(200).json({
      success: true,
      message: 'License activated successfully',
      license,
      activations: updatedActivations,
    });
  } catch (error) {
    console.error('Activation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
