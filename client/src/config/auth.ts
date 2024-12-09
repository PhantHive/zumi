export const authConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/oauth/callback',
  scopes: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  access_type: 'offline',
  prompt: 'consent'
};