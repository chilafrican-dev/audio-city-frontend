/**
 * R2 Configuration Helper
 * Helps you test and configure your existing R2 bucket
 */

require('dotenv').config();
const { S3Client, ListBucketsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'audio-city';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  R2 Configuration Test');
console.log('═══════════════════════════════════════════════════════════════\n');

// Check if credentials are set
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.log('❌ R2 credentials not found in .env file\n');
  console.log('Please add these to backend/.env:');
  console.log('  R2_ACCOUNT_ID=your_account_id');
  console.log('  R2_ACCESS_KEY_ID=your_access_key_id');
  console.log('  R2_SECRET_ACCESS_KEY=your_secret_access_key');
  console.log('  R2_BUCKET_NAME=your_bucket_name');
  console.log('  R2_PUBLIC_URL=https://pub-xxxxx.r2.dev (optional)\n');
  process.exit(1);
}

console.log('✅ Credentials found in .env\n');
console.log('Testing R2 connection...\n');

// Initialize S3 client for R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  // For development: allow self-signed certificates
  requestHandler: {
    httpsAgent: require('https').globalAgent,
  },
  // Disable SSL verification in development (not recommended for production)
  tls: process.env.NODE_ENV === 'production' ? undefined : false,
});

async function testR2() {
  try {
    // Test 1: Try to list objects in the bucket directly (simpler test)
    console.log(`📋 Test 1: Checking bucket "${R2_BUCKET_NAME}"...`);
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 5, // Just check first 5 objects
    });
    
    try {
      const listResponse = await r2Client.send(listCommand);
      const objectCount = listResponse.KeyCount || 0;
      console.log(`   ✅ Bucket accessible! Contains ${objectCount} object(s)`);
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        console.log('\n   Sample objects:');
        listResponse.Contents.slice(0, 5).forEach((obj, i) => {
          console.log(`   ${i + 1}. ${obj.Key} (${(obj.Size / 1024).toFixed(2)} KB)`);
        });
      } else {
        console.log('   ℹ️  Bucket is empty (ready for uploads!)');
      }
    } catch (bucketError) {
      if (bucketError.name === 'NoSuchBucket') {
        console.log(`   ❌ Bucket "${R2_BUCKET_NAME}" not found`);
        console.log(`   💡 Check your R2_BUCKET_NAME in .env`);
      } else if (bucketError.name === 'AccessDenied' || bucketError.message.includes('Access Denied')) {
        console.log(`   ⚠️  Access Denied - Checking credentials...`);
        console.log(`   💡 This might mean:`);
        console.log(`      • Token doesn't have access to this bucket`);
        console.log(`      • Bucket name is incorrect`);
        console.log(`      • Token permissions need to be updated`);
        throw bucketError;
      } else {
        throw bucketError;
      }
    }
    
    // Test 2: List all buckets (to verify credentials work)
    console.log('\n📋 Test 2: Verifying credentials...');
    try {
      const bucketsCommand = new ListBucketsCommand({});
      const bucketsResponse = await r2Client.send(bucketsCommand);
      console.log(`   ✅ Credentials valid! Found ${bucketsResponse.Buckets?.length || 0} bucket(s)`);
      
      if (bucketsResponse.Buckets && bucketsResponse.Buckets.length > 0) {
        console.log('\n   Available buckets:');
        bucketsResponse.Buckets.forEach(bucket => {
          const isCurrent = bucket.Name === R2_BUCKET_NAME ? ' ← current' : '';
          console.log(`      - ${bucket.Name}${isCurrent}`);
        });
      }
    } catch (listError) {
      console.log(`   ⚠️  Could not list buckets: ${listError.message}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ R2 Configuration Successful!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Your backend is ready to use R2 for:');
    console.log('  • Track uploads → r2://' + R2_BUCKET_NAME + '/tracks/');
    console.log('  • Profile images → r2://' + R2_BUCKET_NAME + '/profiles/\n');

  } catch (error) {
    console.log('\n❌ Error connecting to R2:');
    console.log(`   ${error.message}\n`);
    
    if (error.message.includes('InvalidAccessKeyId')) {
      console.log('💡 Check your R2_ACCESS_KEY_ID in .env');
    } else if (error.message.includes('SignatureDoesNotMatch')) {
      console.log('💡 Check your R2_SECRET_ACCESS_KEY in .env');
    } else if (error.message.includes('Account ID')) {
      console.log('💡 Check your R2_ACCOUNT_ID in .env');
    }
    
    process.exit(1);
  }
}

testR2();

