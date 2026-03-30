const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BUCKET = process.env.S3_BUCKET;
const PREFIX = process.env.S3_PREFIX || 'backups';
const REGION = process.env.AWS_REGION || 'us-east-1';

if (!BUCKET) {
  console.error('S3_BUCKET environment variable is required');
  process.exit(2);
}

const s3 = new S3Client({ region: REGION });

function walk(dir, cb) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const p = path.join(dir, file);
    const stat = fs.statSync(p);
    if (stat && stat.isDirectory()) walk(p, cb);
    else cb(p);
  });
}

(async function main() {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseKey = `${PREFIX}/${ts}`;
    if (!fs.existsSync(DATA_DIR)) {
      console.error('No data directory to backup:', DATA_DIR);
      process.exit(0);
    }
    const uploads = [];
    walk(DATA_DIR, (filePath) => {
      const rel = path.relative(DATA_DIR, filePath);
      const key = `${baseKey}/${rel}`;
      const body = fs.readFileSync(filePath);
      uploads.push({ Key: key, Body: body });
    });
    for (const u of uploads) {
      console.log('Uploading', u.Key);
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: u.Key, Body: u.Body }));
    }
    console.log('Backup complete. Objects uploaded to s3://%s/%s', BUCKET, baseKey);
  } catch (e) {
    console.error('Backup failed', e && e.message);
    process.exit(1);
  }
})();
