import { NextApiRequest, NextApiResponse } from 'next';
import { UpdateCheckRequest, UpdateCheckResponse } from '@/types';
import { getLicense } from '@/lib/supabase';
import { generateSignedUrl } from '@/lib/utils';

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

    if (!license_key || typeof license_key !== 'string') {
      return res.status(400).json({
        update_available: false,
      });
    }

    if (!version || typeof version !== 'string') {
      return res.status(400).json({
        update_available: false,
      });
    }

    // Verify license exists (can be expired, just needs to exist)
    const license = await getLicense(license_key);

    if (!license) {
      return res.status(403).json({
        update_available: false,
      });
    }

    // For now, we'll hardcode the latest version and changelog
    // In production, you'd fetch this from S3 or a database
    const latestVersion = '0.9.2';
    const changelog = 'Version 0.9.2 - License activation improvements and better error handling';

    // Compare versions (simple string comparison for now)
    const currentVersion = version;
    const updateAvailable = currentVersion !== latestVersion;

    if (!updateAvailable) {
      return res.status(200).json({
        update_available: false,
      });
    }

    // Generate signed download URL
    const bucketName = process.env.AWS_S3_BUCKET!;
    const downloadUrl = generateSignedUrl(bucketName, 'kato-sync-latest.zip');

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
