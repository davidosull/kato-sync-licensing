#!/usr/bin/env node

const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function setMetadata(version, changelog) {
  const bucketName = process.env.AWS_S3_BUCKET;

  if (!bucketName) {
    console.error('❌ AWS_S3_BUCKET environment variable not set');
    process.exit(1);
  }

  try {
    // Update metadata for latest.zip
    const latestCommand = new CopyObjectCommand({
      Bucket: bucketName,
      Key: 'kato-sync-latest.zip',
      CopySource: `${bucketName}/kato-sync-latest.zip`,
      Metadata: {
        version: version,
        changelog: changelog,
        updated_at: new Date().toISOString(),
      },
      MetadataDirective: 'REPLACE',
    });

    await s3Client.send(latestCommand);
    console.log(`✅ Updated metadata for kato-sync-latest.zip`);

    // Update metadata for versioned file
    const versionedCommand = new CopyObjectCommand({
      Bucket: bucketName,
      Key: `kato-sync-${version}.zip`,
      CopySource: `${bucketName}/kato-sync-${version}.zip`,
      Metadata: {
        version: version,
        changelog: changelog,
        updated_at: new Date().toISOString(),
      },
      MetadataDirective: 'REPLACE',
    });

    await s3Client.send(versionedCommand);
    console.log(`✅ Updated metadata for kato-sync-${version}.zip`);

    console.log(`🎉 Metadata updated successfully!`);
    console.log(`📝 Version: ${version}`);
    console.log(`📝 Changelog: ${changelog}`);

  } catch (error) {
    console.error('❌ Metadata update failed:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node set-metadata.js <version> <changelog>');
  console.log('Example: node set-metadata.js 0.9.2 "Version 0.9.2 - Bug fixes and improvements"');
  process.exit(1);
}

const [version, changelog] = args;

setMetadata(version, changelog);
