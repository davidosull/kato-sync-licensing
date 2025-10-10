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
    const { version, license_key } = req.query as UpdateCheckRequest;

    if (!license_key) {
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
    const latestVersion = '1.2.0';
    const changelog = 'Bug fixes and performance improvements';

    // Compare versions (simple string comparison for now)
    const currentVersion = version || '1.0.0';
    const updateAvailable = currentVersion !== latestVersion;

    if (!updateAvailable) {
      return res.status(200).json({
        update_available: false,
      });
    }

    // Generate signed download URL
    const bucketName = process.env.S3_BUCKET_NAME!;
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
