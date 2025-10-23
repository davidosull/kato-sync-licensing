#!/usr/bin/env node

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadPlugin(pluginPath, version, changelog) {
  const bucketName = process.env.AWS_S3_BUCKET;

  if (!bucketName) {
    console.error('❌ AWS_S3_BUCKET environment variable not set');
    process.exit(1);
  }

  try {
    // Read the plugin zip file
    const fileContent = fs.readFileSync(pluginPath);

    // Upload versioned file
    const versionedKey = `kato-sync-${version}.zip`;
    const versionedCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: versionedKey,
      Body: fileContent,
      ContentType: 'application/zip',
      Metadata: {
        version: version,
        changelog: changelog,
        uploaded_at: new Date().toISOString(),
      },
    });

    await s3Client.send(versionedCommand);
    console.log(`✅ Uploaded ${versionedKey}`);

    // Upload latest pointer
    const latestCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: 'kato-sync-latest.zip',
      Body: fileContent,
      ContentType: 'application/zip',
      Metadata: {
        version: version,
        changelog: changelog,
        uploaded_at: new Date().toISOString(),
      },
    });

    await s3Client.send(latestCommand);
    console.log(`✅ Uploaded kato-sync-latest.zip`);

    console.log(`🎉 Plugin ${version} uploaded successfully!`);
    console.log(`📝 Changelog: ${changelog}`);

  } catch (error) {
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node upload-plugin.js <plugin-path> <version> <changelog>');
  console.log('Example: node upload-plugin.js ../kato-sync-0.9.2.zip 0.9.2 "Bug fixes and improvements"');
  process.exit(1);
}

const [pluginPath, version, changelog] = args;

// Resolve plugin path
const resolvedPath = path.resolve(pluginPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ Plugin file not found: ${resolvedPath}`);
  process.exit(1);
}

uploadPlugin(resolvedPath, version, changelog);
