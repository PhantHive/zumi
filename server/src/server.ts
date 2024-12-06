import express from 'express';
import cors from 'cors';
import path from 'path';
import songRoutes from './routes/songs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use('/api/songs', songRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});