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
): Promise<{ version: string }> {
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
    return { version };
  } catch (error) {
    console.error('Error fetching version from S3:', error);
    return {
      version: '0.9.2',
    };
  }
}

export async function fetchChangelogFromMarketingSite(
  currentVersion: string,
  latestVersion: string
): Promise<string> {
  try {
    // Fetch changelog from marketing site
    const response = await fetch(
      'https://katosync.com/.netlify/functions/changelog',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const changelogReleases = await response.json();

    // Show all changelog releases (complete history)
    const relevantReleases = changelogReleases;

    if (relevantReleases.length === 0) {
      return `Version ${latestVersion} - Bug fixes and improvements`;
    }

    // Format changelog for WordPress update modal
    let formattedChangelog = '';

    relevantReleases.forEach((release: any) => {
      // Format date from YYYY-MM-DD to "DD Month, YYYY"
      const dateObj = new Date(release.date);
      const formattedDate = dateObj.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      formattedChangelog += `<h3>Version ${release.version}</h3>\n<p style="font-size: 12px; opacity: 0.8;">${release.title} - ${formattedDate}</p>\n`;

      if (release.changes) {
        Object.entries(release.changes).forEach(
          ([category, items]: [string, any]) => {
            formattedChangelog += `<p><strong>${category}</strong></p>\n<ul>\n`;
            items.forEach((item: string) => {
              formattedChangelog += `<li>${item}</li>\n`;
            });
            formattedChangelog += `</ul>\n`;
          }
        );
      }

      formattedChangelog += '\n';
    });

    return (
      formattedChangelog.trim() ||
      `Version ${latestVersion} - Bug fixes and improvements`
    );
  } catch (error) {
    console.error('Error fetching changelog from marketing site:', error);
    // Fallback to generic changelog
    return `Version ${latestVersion} - Bug fixes and improvements`;
  }
}

/**
 * Compare semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  // Remove any non-numeric characters except dots and dashes
  const cleanVersion = (v: string) => v.replace(/[^0-9.-]/g, '');
  
  const version1 = cleanVersion(v1).split('.').map(Number);
  const version2 = cleanVersion(v2).split('.').map(Number);
  
  // Pad arrays to same length
  const maxLength = Math.max(version1.length, version2.length);
  while (version1.length < maxLength) version1.push(0);
  while (version2.length < maxLength) version2.push(0);
  
  // Compare each segment
  for (let i = 0; i < maxLength; i++) {
    if (version1[i] < version2[i]) return -1;
    if (version1[i] > version2[i]) return 1;
  }
  
  return 0;
}

/**
 * Check if version1 is less than version2
 */
export function isVersionLessThan(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) < 0;
}

/**
 * Check if version1 is greater than version2
 */
export function isVersionGreaterThan(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) > 0;
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
