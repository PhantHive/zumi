import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import songRoutes, {staticPaths} from './routes/songs';
import connectDB from './utils/mongoose';
import dotenv from 'dotenv';
import auth from './middlewares/auth';
import authRoutes from "./routes/authRoutes";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL // Production client URL
    : ['http://localhost:31275', 'http://localhost:3000'], // Dev client URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());

app.use(express.static(path.join(__dirname, '../../public')));
app.use('/uploads', express.static(path.join(staticPaths.uploads)));
app.use('/data', express.static(staticPaths.data));

// Routes
app.use('/api/auth', authRoutes);  // Auth routes should be public
app.use('/api/songs', auth, songRoutes);  // Protect song routes with auth middleware

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;