import { NextApiRequest, NextApiResponse } from 'next';
import { UpdateCheckRequest, UpdateCheckResponse } from '@/types';
import { getLicense } from '@/lib/supabase';
import {
  generateSignedUrl,
  getLatestVersionFromS3,
  fetchChangelogFromMarketingSite,
} from '@/lib/utils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateCheckResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      update_available: false,
    });
  }

  try {
    const { version, license_key } = req.query;

    if (!version || typeof version !== 'string') {
      return res.status(400).json({
        update_available: false,
      });
    }

    // Check if license exists (optional - updates should be visible to all)
    let license = null as null | any;
    if (license_key) {
      license = await getLicense(license_key as string);
    }

    // Get latest version from S3
    const bucketName = process.env.AWS_S3_BUCKET!;
    const { version: latestVersion } = await getLatestVersionFromS3(bucketName);

    // Compare versions (simple string comparison for now)
    const currentVersion = version;
    const updateAvailable = currentVersion !== latestVersion;

    if (!updateAvailable) {
      return res.status(200).json({
        update_available: false,
      });
    }

    // Fetch changelog from marketing site
    const changelog = await fetchChangelogFromMarketingSite(
      currentVersion,
      latestVersion
    );

    // Determine download URL and upgrade URL based on license status
    let downloadUrl = '';
    let upgradeUrl = '';
    const canDownload =
      !!license &&
      (license.status === 'active' || license.status === 'grace_period');
    if (canDownload) {
      downloadUrl = await generateSignedUrl(bucketName, 'kato-sync-latest.zip');
    } else {
      upgradeUrl = 'https://katosync.com/pricing';
    }

    return res.status(200).json({
      update_available: true,
      latest_version: latestVersion,
      download_url: downloadUrl,
      changelog,
      changelog_url: 'https://katosync.com/changelog',
      upgrade_url: upgradeUrl,
    });
  } catch (error) {
    console.error('Update check error:', error);
    return res.status(500).json({
      update_available: false,
    });
  }
}
