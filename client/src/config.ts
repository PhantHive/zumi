export const API_URL = process.env.NODE_ENV === 'production'
  ? `http://${process.env.VPS_IP}:${process.env.API_PORT}`
  : 'http://localhost:3000';