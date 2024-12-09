import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import songRoutes from './routes/songs';
import connectDB from './utils/mongoose';
import dotenv from 'dotenv';
import auth from './middlewares/auth';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Authentication middleware
app.use(auth);

// Routes
app.use('/api/songs', songRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export default for ESNext compatibility
export default app;
