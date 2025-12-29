/**
 * Cloudflare R2 Storage Helper
 * Handles upload/download of tracks and images to R2
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

// R2 Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'audio-city';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., https://pub-xxxxx.r2.dev

// Initialize S3 client for R2 (R2 is S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a file to R2
 * @param {string} localFilePath - Path to local file
 * @param {string} r2Key - Key/path in R2 (e.g., 'tracks/track-123.mp3')
 * @param {string} contentType - MIME type (e.g., 'audio/mpeg')
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadToR2(localFilePath, r2Key, contentType = null) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured. Check environment variables.');
  }

  try {
    const fileContent = fs.readFileSync(localFilePath);
    
    // Auto-detect content type if not provided
    if (!contentType) {
      const ext = path.extname(r2Key).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      };
      contentType = mimeTypes[ext] || 'application/octet-stream';
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: fileContent,
      ContentType: contentType,
      // Make publicly accessible
      ACL: 'public-read',
    });

    await r2Client.send(command);

    // Return public URL
    if (R2_PUBLIC_URL) {
      return `${R2_PUBLIC_URL}/${r2Key}`;
    } else {
      // Fallback: generate signed URL (valid for 1 year)
      return await getSignedUrl(r2Client, new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
      }), { expiresIn: 31536000 }); // 1 year
    }
  } catch (error) {
    console.error('❌ R2 Upload Error:', error);
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
}

/**
 * Upload file buffer directly to R2 (for multer memory storage)
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} r2Key - Key/path in R2
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Public URL
 */
async function uploadBufferToR2(fileBuffer, r2Key, contentType = null) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured.');
  }

  try {
    if (!contentType) {
      const ext = path.extname(r2Key).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      };
      contentType = mimeTypes[ext] || 'application/octet-stream';
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await r2Client.send(command);

    if (R2_PUBLIC_URL) {
      return `${R2_PUBLIC_URL}/${r2Key}`;
    } else {
      return await getSignedUrl(r2Client, new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
      }), { expiresIn: 31536000 });
    }
  } catch (error) {
    console.error('❌ R2 Upload Error:', error);
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
}

/**
 * Delete a file from R2
 * @param {string} r2Key - Key/path in R2
 */
async function deleteFromR2(r2Key) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured.');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    await r2Client.send(command);
  } catch (error) {
    console.error('❌ R2 Delete Error:', error);
    throw new Error(`Failed to delete from R2: ${error.message}`);
  }
}

/**
 * Get a signed URL for private access (if needed)
 * @param {string} r2Key - Key/path in R2
 * @param {number} expiresIn - Expiration in seconds (default: 1 hour)
 * @returns {Promise<string>} - Signed URL
 */
async function getSignedUrlForR2(r2Key, expiresIn = 3600) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured.');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    return await getSignedUrl(r2Client, command, { expiresIn });
  } catch (error) {
    console.error('❌ R2 Signed URL Error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

module.exports = {
  uploadToR2,
  uploadBufferToR2,
  deleteFromR2,
  getSignedUrlForR2,
};

