import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import songRoutes, { staticPaths } from './routes/songs.js';
import connectDB from './utils/mongoose.js';
import dotenv from 'dotenv';
import auth from './middlewares/auth.js';
import authRoutes from './routes/authRoutes.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
connectDB();

const app = express();
const PORT = process.env.API_PORT || 3000;

// CORS configuration
const corsOptions = {
    origin:
        process.env.NODE_ENV === 'production'
            ? process.env.CLIENT_URL // Production client URL
            : ['http://localhost:31275', 'http://localhost:3000'], // Dev client URLs
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());

app.use(express.static(path.join(__dirname, '../../public')));
app.use('/uploads', express.static(path.join(staticPaths.uploads)));
app.use('/data', express.static(staticPaths.data));

// Serve mobile releases (APK files)
app.use('/mobile', express.static('/opt/zumi-mobile/releases'));

// Routes
app.use('/api/auth', authRoutes); // Auth routes should be public
app.use('/api/songs', auth, songRoutes); // Protect song routes with auth middleware

// Mobile version check endpoint
app.get('/api/mobile/version', (req, res) => {
    try {
        const versionFile = '/opt/zumi-mobile/releases/version.json';
        if (fs.existsSync(versionFile)) {
            const versionData = fs.readFileSync(versionFile, 'utf8');
            res.json(JSON.parse(versionData));
        } else {
            res.status(404).json({
                error: 'No version information available',
                message: 'Update system not initialized',
            });
        }
    } catch (error) {
        console.error('Error reading version file:', error);
        res.status(500).json({
            error: 'Failed to check version',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;
