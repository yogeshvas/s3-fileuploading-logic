require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List all buckets
app.get('/api/buckets', async (req, res) => {
  try {
    const { Buckets } = await s3.send(new ListBucketsCommand({}));
    res.json({ buckets: Buckets.map(b => ({ name: b.Name, created: b.CreationDate })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List files in a bucket
app.get('/api/buckets/:bucket/files', async (req, res) => {
  try {
    const { Contents = [], CommonPrefixes = [] } = await s3.send(
      new ListObjectsV2Command({ Bucket: req.params.bucket, Delimiter: '/' })
    );
    res.json({
      files: Contents.map(f => ({ key: f.Key, size: f.Size, lastModified: f.LastModified })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { bucket } = req.query;
  if (!bucket) return res.status(400).json({ error: 'Missing ?bucket= query param' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: req.file.originalname,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
    res.json({ message: `Uploaded ${req.file.originalname} to ${bucket}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get presigned download URL
app.get('/api/download/:bucket/*', async (req, res) => {
  const bucket = req.params.bucket;
  const key = req.params[0];
  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`S3 Tester running → http://localhost:${PORT}`));
