import crypto from 'crypto';
import { LemonSqueezyWebhook } from '@/types';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export function isLocalEnvironment(siteUrl: string): boolean {
  const localPatterns = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\.0\.0\.1/i,
    /^https?:\/\/::1/i,
    /\.local$/i,
    /\.test$/i,
    /\.dev$/i,
    /^https?:\/\/192\.168\./i,
    /^https?:\/\/10\./i,
  ];

  return localPatterns.some((pattern) => pattern.test(siteUrl));
}

export function extractDomain(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    return url.hostname;
  } catch {
    return siteUrl;
  }
}

export function getTierLimit(tier: string): number {
  const limits: Record<string, number> = {
    freelancer: 1,
    agency: 5,
    enterprise: -1, // -1 means unlimited
  };

  return limits[tier] || 0;
}

export function isLicenseExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function getGracePeriodDays(expiresAt: string): number {
  const expiryDate = new Date(expiresAt);
  const now = new Date();

  // If license hasn't expired yet, return 0 (not in grace period)
  if (now < expiryDate) {
    return 0;
  }

  // Calculate days since expiry
  const diffTime = now.getTime() - expiryDate.getTime();
  const daysSinceExpiry = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Return remaining grace period days (7 days total grace period)
  return Math.max(0, 7 - daysSinceExpiry);
}

export function isInGracePeriod(expiresAt: string): boolean {
  const expiryDate = new Date(expiresAt);
  const now = new Date();

  // License must be expired to be in grace period
  if (now < expiryDate) {
    return false;
  }

  // Check if within 7 days of expiry
  const diffTime = now.getTime() - expiryDate.getTime();
  const daysSinceExpiry = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return daysSinceExpiry <= 7;
}

export function getLicenseStatus(
  license: any
): 'active' | 'expired' | 'grace_period' | 'invalid' {
  if (!license) return 'invalid';

  if (license.status === 'cancelled') return 'invalid';

  if (isInGracePeriod(license.expires_at)) return 'grace_period';

  if (isLicenseExpired(license.expires_at)) return 'expired';

  return 'active';
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function getLatestVersionFromS3(
  bucketName: string
): Promise<{ version: string; changelog: string }> {
  try {
    // List all versioned plugin zips and pick the highest semver
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const listCmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'kato-sync-',
    });

    const listed = await s3Client.send(listCmd);
    const keys = (listed.Contents || [])
      .map((o) => o.Key || '')
      .filter((k) => /^kato-sync-\d+\.\d+\.\d+\.zip$/.test(k));

    const parse = (k: string) =>
      k.match(/kato-sync-(\d+\.\d+\.\d+)\.zip/)?.[1] || '';
    const compare = (a: string, b: string) => {
      const pa = a.split('.').map((n) => parseInt(n, 10));
      const pb = b.split('.').map((n) => parseInt(n, 10));
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    };

    const versions = keys.map(parse).filter(Boolean);
    const latest = versions.sort(compare).pop();

    const version = latest || '0.9.2';
    const changelog = `Version ${version} - Bug fixes and improvements`;
    return { version, changelog };
  } catch (error) {
    console.error('Error fetching version from S3:', error);
    return {
      version: '0.9.2',
      changelog: 'Version 0.9.2 - Bug fixes and improvements',
    };
  }
}

export async function generateSignedUrl(
  bucketName: string,
  key: string,
  expiresIn: number = 900
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    // Fallback to direct URL
    const region = process.env.AWS_REGION || 'eu-north-1';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
}
