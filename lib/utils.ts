import crypto from 'crypto';
import { LemonSqueezyWebhook } from '@/types';

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
    unlimited: -1, // -1 means unlimited
  };

  return limits[tier] || 0;
}

export function isLicenseExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function getGracePeriodDays(expiresAt: string): number {
  const expiryDate = new Date(expiresAt);
  const now = new Date();
  const diffTime = now.getTime() - expiryDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Return days remaining in grace period (7 days total)
  return Math.max(0, 7 - diffDays);
}

export function isInGracePeriod(expiresAt: string): boolean {
  return getGracePeriodDays(expiresAt) > 0;
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

export function generateSignedUrl(
  bucketName: string,
  key: string,
  expiresIn: number = 900
): string {
  // This is a placeholder - in production, you'd use AWS SDK to generate signed URLs
  // For now, return a direct URL (you'll need to implement proper S3 signed URL generation)
  const region = process.env.AWS_REGION || 'eu-north-1';
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
}
