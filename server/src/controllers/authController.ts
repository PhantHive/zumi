import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser, CreateUserDTO } from '../models/User';

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

// Fix the interfaces
interface GoogleAuthRequest extends Request {
  body: {
    googleToken: string;
  };
}

// Make user required in AuthenticatedRequest since middleware guarantees it
export interface AuthenticatedRequest extends Request {
  user: IUser;  // Remove optional flag since middleware ensures this exists
}

export class AuthController {
  async authenticate(req: GoogleAuthRequest, res: Response): Promise<void> {
    try {
      const { googleToken } = req.body;

      // Get user info using the access token
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Accept': 'application/json'
        }
      });

      if (!userInfoResponse.ok) {
        throw new Error('Failed to get user info from Google');
      }

      const userInfo = await userInfoResponse.json() as GoogleUserInfo;

      // Try to find existing user
      let user = await User.findByGoogleId(userInfo.id);

      if (!user) {
        // Create new user if doesn't exist
        const userData: CreateUserDTO = {
          googleId: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture
        };

        try {
          user = await User.createWithGoogle(userData);
          console.log('Created new user:', user.id);
        } catch (error) {
          console.error('Error creating user:', error);
          res.status(500).json({ error: 'Failed to create user' });
          return;
        }
      }

      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        user: user.toJSON(),
        token
      });
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.user.id)
        .populate('playlists.songs');

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ data: user });
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}