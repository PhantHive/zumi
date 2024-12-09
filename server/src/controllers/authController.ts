import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser, CreateUserDTO } from '../models/User';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

interface GoogleAuthRequest extends Request {
  body: {
    googleToken: string;
  };
}

interface AuthenticatedRequest extends Request {
  user: IUser;
}

export class AuthController {
  async authenticate(req: GoogleAuthRequest, res: Response): Promise<void> {
    try {
      const { googleToken } = req.body;

      const ticket = await googleClient.verifyIdToken({
        idToken: googleToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || !payload.name) {
        res.status(401).json({ error: 'Invalid token payload' });
        return;
      }

      const user = await User.findByGoogleId(payload.sub);
      const userData: CreateUserDTO = {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };

      const authenticatedUser = user ?? await User.createWithGoogle(userData);

      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
      }

      const token = jwt.sign(
        { userId: authenticatedUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        user: authenticatedUser,
        token
      });
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.user.id).populate('playlists.songs');
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ data: user });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}