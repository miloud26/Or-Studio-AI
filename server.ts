import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import { createServer as createViteServer } from 'vite';
import { getMetadata, renderVideo } from './src/server/videoProcessor.ts';
import { createJob, updateJob, getJob, setJobClips, getJobClips } from './src/server/jobs.ts';
import { generateCreativeOutput } from './src/services/geminiService.ts';
import { ClipMetadata, MontagePlanSchema } from './src/types.ts';

const app = express();
const PORT = 3000;

// Directories
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const OUTPUT_DIR = path.join(process.cwd(), 'output');
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(OUTPUT_DIR);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  },
});

app.use(express.json());

// Routes
app.post('/api/upload', upload.array('clips', 4), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length !== 4) {
      return res.status(400).json({ error: 'Exactly 4 clips are required' });
    }

    const jobId = uuidv4();
    createJob(jobId);

    const metadata: ClipMetadata[] = await Promise.all(
      files.map(async (file, index) => {
        const meta = await getMetadata(file.path);
        return {
          id: `clip_${index + 1}`,
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          duration: meta.duration || 0,
          width: meta.width || 0,
          height: meta.height || 0,
          fps: meta.fps || 30,
          size: meta.size || 0,
        };
      })
    );

    setJobClips(jobId, metadata);
    updateJob(jobId, { status: 'analyzing', progress: 100 });

    res.json({ jobId, clips: metadata });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process uploads' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { jobId, prompt, mode } = req.body;
    if (!jobId || !prompt || !mode) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const clips = getJobClips(jobId);
    if (!clips) {
      return res.status(404).json({ error: 'Job assets not found' });
    }

    updateJob(jobId, { status: 'analyzing', progress: 50 });
    
    const creativeOutput = await generateCreativeOutput(jobId, clips, prompt, mode);
    
    updateJob(jobId, { status: 'analyzing', progress: 100 });
    
    res.json(creativeOutput);
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

app.post('/api/render', async (req, res) => {
  const { jobId, montagePlan } = req.body;
  if (!jobId || !montagePlan) {
    return res.status(400).json({ error: 'Job ID and montage plan are required' });
  }

  const job = getJob(jobId);
  const clips = getJobClips(jobId);

  if (!job || !clips) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Validate plan with Zod
  const validation = MontagePlanSchema.safeParse(montagePlan);
  if (!validation.success) {
    console.error('Validation error:', validation.error);
    return res.status(400).json({ error: 'Invalid montage plan format', details: validation.error });
  }

  updateJob(jobId, { status: 'rendering', progress: 0, montagePlan: validation.data });

  // Start background rendering
  renderVideo(validation.data, clips, OUTPUT_DIR, (progress) => {
    updateJob(jobId, { progress });
  })
    .then((outputPath) => {
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        outputUrl: `/api/output/${path.basename(outputPath)}`,
      });
    })
    .catch((error) => {
      console.error('Rendering error:', error);
      updateJob(jobId, { status: 'failed', error: error.message });
    });

  res.json({ status: 'renderingStarted' });
});

app.get('/api/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/api/output/:fileName', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

// Vite middleware
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
