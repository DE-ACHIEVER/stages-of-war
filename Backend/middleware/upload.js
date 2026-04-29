import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const uploadDir = path.join(process.cwd(), config.UPLOAD.PATH);
const matchDir = path.join(uploadDir, 'match-evidence');
const tempDir = path.join(uploadDir, 'temp');

[matchDir, tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use temp directory for initial upload
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `temp_${uniqueId}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    if (config.UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and HEIC are allowed.'), false);
    }
};

// Multer upload instance
export const upload = multer({
    storage,
    limits: {
        fileSize: config.UPLOAD.MAX_SIZE
    },
    fileFilter
});

// Process and validate uploaded images
export const processEvidence = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
        return next();
    }

    try {
        const processedFiles = [];
        const matchId = req.body.matchId || req.params.id;

        // Create match-specific directory
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const matchUploadDir = path.join(
            matchDir,
            String(year),
            month,
            day,
            `match_${matchId}`
        );

        if (!fs.existsSync(matchUploadDir)) {
            fs.mkdirSync(matchUploadDir, { recursive: true });
        }

        // Process each file
        for (const file of req.files) {
            const tempPath = file.path;
            
            // Read file buffer
            const buffer = fs.readFileSync(tempPath);
            
            // Verify file type
            const type = await fileTypeFromBuffer(buffer);
            if (!type || !config.UPLOAD.ALLOWED_TYPES.includes(type.mime)) {
                fs.unlinkSync(tempPath);
                throw new Error(`Invalid file type: ${file.originalname}`);
            }

            // Generate filename
            const timestamp = Date.now();
            const filename = `evidence_${matchId}_${timestamp}_${processedFiles.length + 1}.jpg`;
            const finalPath = path.join(matchUploadDir, filename);

            // Process image with sharp
            let image = sharp(buffer);
            
            // Get metadata
            const metadata = await image.metadata();
            
            // Resize if too large
            if (metadata.width > 1920 || metadata.height > 1080) {
                image = image.resize(1920, 1080, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Convert to JPEG and save
            await image
                .jpeg({ quality: 85 })
                .toFile(finalPath);

            // Remove temp file
            fs.unlinkSync(tempPath);

            // Add to processed files
            processedFiles.push({
                filename,
                path: finalPath,
                size: fs.statSync(finalPath).size,
                originalName: file.originalname
            });

            logger.debug(`✅ Processed evidence: ${filename}`);
        }

        // Attach processed files to request
        req.processedFiles = processedFiles;
        next();
    } catch (error) {
        logger.error('❌ Evidence processing error:', error);
        
        // Clean up any temp files
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        next(error);
    }
};

// Clean up old temp files (run via cron job)
export const cleanupTempFiles = () => {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();

    files.forEach(file => {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        // Delete files older than 24 hours
        if (age > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            logger.debug(`🧹 Cleaned up temp file: ${file}`);
        }
    });
};
