import { NextApiRequest, NextApiResponse } from 'next';
import { UpdateCheckRequest, UpdateCheckResponse } from '@/types';
import { getLicense } from '@/lib/supabase';
import { generateSignedUrl, getLatestVersionFromS3 } from '@/lib/utils';

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

    // License key is optional - updates should be visible to all
    if (!license_key) {
      // No license key provided, but we still want to show updates
    }

    if (!version || typeof version !== 'string') {
      return res.status(400).json({
        update_available: false,
      });
    }

    // Check if license exists (optional - updates should be visible to all)
    let license = null;
    if (license_key) {
      license = await getLicense(license_key);
    }

    // Get latest version and changelog from S3 metadata
    const bucketName = process.env.AWS_S3_BUCKET!;
    const { version: latestVersion, changelog } = await getLatestVersionFromS3(bucketName);

    // Compare versions (simple string comparison for now)
    const currentVersion = version;
    const updateAvailable = currentVersion !== latestVersion;

    if (!updateAvailable) {
      return res.status(200).json({
        update_available: false,
      });
    }

    // Generate signed download URL (only if license is valid)
    let downloadUrl = '';
    if (license && license.status === 'active') {
      downloadUrl = await generateSignedUrl(bucketName, 'kato-sync-latest.zip');
    }

    return res.status(200).json({
      update_available: true,
      latest_version: latestVersion,
      download_url: downloadUrl,
      changelog,
    });
  } catch (error) {
    console.error('Update check error:', error);
    return res.status(500).json({
      update_available: false,
    });
  }
}
