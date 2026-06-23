const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Make sure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('Could not create upload directory:', err.message);
}

// Multer Storage for Videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|mov|avi|mkv|quicktime/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error('Seuls les fichiers vidéos sont autorisés (MP4, WebM, MOV, AVI, MKV).'));
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for video uploads
});

// 1. GET /api/videos - Public route to retrieve all videos
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM videos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des vidéos.' });
  }
});

// 2. POST /api/videos/admin - Admin route to add a video
router.post('/admin', authenticateToken, requireAdmin, (req, res) => {
  upload.single('videoFile')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { title, type, youtubeUrl } = req.body;

    if (!title || !title.trim()) {
      // If a file was uploaded, clean it up
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({ error: 'Le titre est obligatoire.' });
    }

    if (type !== 'youtube' && type !== 'file') {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({ error: 'Type de vidéo invalide.' });
    }

    let finalUrl = '';

    if (type === 'youtube') {
      if (!youtubeUrl || !youtubeUrl.trim()) {
        return res.status(400).json({ error: 'Le lien YouTube est obligatoire pour ce type.' });
      }
      finalUrl = youtubeUrl.trim();
    } else {
      // Type is file
      if (!req.file) {
        return res.status(400).json({ error: 'Veuillez uploader un fichier vidéo.' });
      }
      finalUrl = `/api/uploads/${req.file.filename}`;
    }

    try {
      const result = await query(
        'INSERT INTO videos (title, url, type) VALUES ($1, $2, $3) RETURNING *',
        [title.trim(), finalUrl, type]
      );
      res.status(201).json(result.rows[0]);
    } catch (dbErr) {
      console.error('Database error saving video:', dbErr);
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      res.status(500).json({ error: 'Erreur lors de la sauvegarde de la vidéo en base de données.' });
    }
  });
});

// 3. DELETE /api/videos/admin/:id - Admin route to delete a video
router.delete('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
  const videoId = req.params.id;

  try {
    const videoRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (videoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vidéo introuvable.' });
    }

    const video = videoRes.rows[0];

    // If type is file, delete it from local disk
    if (video.type === 'file') {
      const filename = path.basename(video.url);
      const filePath = path.join(uploadDir, filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted local video file: ${filePath}`);
        }
      } catch (err) {
        console.warn('Could not delete local video file:', err.message);
      }
    }

    await query('DELETE FROM videos WHERE id = $1', [videoId]);
    res.json({ message: 'Vidéo supprimée avec succès.' });

  } catch (err) {
    console.error('Error deleting video:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression de la vidéo.' });
  }
});

module.exports = router;
