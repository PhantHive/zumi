import dotenv from 'dotenv';
dotenv.config();

export const API_URL = process.env.NODE_ENV === 'production'
  ? `http://${process.env.VPS_IP}:${process.env.API_PORT}`
  : `http://localhost:3000`; // 31275 client