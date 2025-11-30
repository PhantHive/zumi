import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser, CreateUserDTO } from '../models/User.js';
import { stateStore } from '../utils/stateStore.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

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

interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    id_token: string;
}

// Fix the interfaces
interface GoogleAuthRequest extends Request {
    body: {
        googleToken: string;
    };
}

// Make user required in AuthenticatedRequest since middleware guarantees it
export interface AuthenticatedRequest extends Request {
    user: IUser; // Remove optional flag since middleware ensures this exists
}

export class AuthController {
    async authenticate(req: GoogleAuthRequest, res: Response): Promise<void> {
        try {
            const { googleToken } = req.body;

            // Get user info using the access token
            const userInfoResponse = await fetch(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                {
                    headers: {
                        Authorization: `Bearer ${googleToken}`,
                        Accept: 'application/json',
                    },
                },
            );

            if (!userInfoResponse.ok) {
                throw new Error('Failed to get user info from Google');
            }

            const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

            // Try to find existing user
            let user = await User.findByGoogleId(userInfo.id);

            if (!user) {
                // Create new user if doesn't exist
                const userData: CreateUserDTO = {
                    googleId: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
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
                { expiresIn: '7d' },
            );

            res.json({
                user: user.toJSON(),
                token,
            });
        } catch (error) {
            console.error('Auth error:', error);
            res.status(401).json({ error: 'Authentication failed' });
        }
    }

    async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const user = req.user; // Assuming user is added to req by auth middleware
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({ data: user });
        } catch (error) {
            console.error('Error fetching profile:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Initiates OAuth flow for mobile app
     * GET /api/auth/google/mobile
     */
    async initiateMobileOAuth(req: Request, res: Response): Promise<void> {
        try {
            // Generate random state for CSRF protection
            const state = crypto.randomBytes(32).toString('hex');

            // Store state with 10 minute expiration
            stateStore.set(state, 'pending', 10);

            const clientId = process.env.GOOGLE_CLIENT_ID;

            // Use BACKEND_URL if available (for domain-based setup), otherwise fall back to IP
            const backendUrl =
                process.env.BACKEND_URL ||
                `http://${process.env.VPS_IP}:${process.env.API_PORT}`;
            const redirectUri = `${backendUrl}/api/auth/google/callback`;

            if (!clientId) {
                throw new Error('GOOGLE_CLIENT_ID not configured');
            }

            // Build Google OAuth URL
            const googleAuthUrl = new URL(
                'https://accounts.google.com/o/oauth2/v2/auth',
            );
            googleAuthUrl.searchParams.append('client_id', clientId);
            googleAuthUrl.searchParams.append('redirect_uri', redirectUri);
            googleAuthUrl.searchParams.append('response_type', 'code');
            googleAuthUrl.searchParams.append('scope', 'openid profile email');
            googleAuthUrl.searchParams.append('state', state);

            // Redirect user to Google OAuth
            res.redirect(googleAuthUrl.toString());
        } catch (error) {
            console.error('Error initiating OAuth:', error);
            res.redirect(
                `zumi://auth-error?message=${encodeURIComponent('Failed to initiate authentication')}`,
            );
        }
    }

    /**
     * Handles OAuth callback from Google
     * GET /api/auth/google/callback
     */
    async handleOAuthCallback(req: Request, res: Response): Promise<void> {
        try {
            const { code, state } = req.query;

            // Validate state parameter
            if (!state || typeof state !== 'string') {
                throw new Error('Missing state parameter');
            }

            const storedState = stateStore.get(state);
            if (!storedState) {
                throw new Error('Invalid or expired state parameter');
            }

            // Delete state after verification (one-time use)
            stateStore.delete(state);

            // Validate code parameter
            if (!code || typeof code !== 'string') {
                throw new Error('Missing authorization code');
            }

            // Exchange code for access token
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            // Use BACKEND_URL if available (for domain-based setup), otherwise fall back to IP
            const backendUrl =
                process.env.BACKEND_URL ||
                `http://${process.env.VPS_IP}:${process.env.API_PORT}`;
            const redirectUri = `${backendUrl}/api/auth/google/callback`;

            if (!clientId || !clientSecret) {
                throw new Error('Google OAuth credentials not configured');
            }

            const tokenResponse = await fetch(
                'https://oauth2.googleapis.com/token',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        code,
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code',
                    }),
                },
            );

            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.text();
                console.error('Token exchange failed:', errorData);
                throw new Error('Failed to exchange code for token');
            }

            const tokenData =
                (await tokenResponse.json()) as GoogleTokenResponse;

            // Get user info using access token
            const userInfoResponse = await fetch(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                {
                    headers: {
                        Authorization: `Bearer ${tokenData.access_token}`,
                        Accept: 'application/json',
                    },
                },
            );

            if (!userInfoResponse.ok) {
                throw new Error('Failed to get user info from Google');
            }

            const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

            // Find or create user
            let user = await User.findByGoogleId(userInfo.id);

            if (!user) {
                const userData: CreateUserDTO = {
                    googleId: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                };

                user = await User.createWithGoogle(userData);
                console.log('Created new user:', user.id);
            }

            if (!process.env.JWT_SECRET) {
                throw new Error('JWT_SECRET not configured');
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' },
            );

            // Prepare user data for mobile app
            const userData = JSON.stringify({
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
            });

            // Redirect to mobile app with token and user data
            const deepLink = `zumi://auth-success?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userData)}`;
            res.redirect(deepLink);
        } catch (error) {
            console.error('OAuth callback error:', error);
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Authentication failed';
            res.redirect(
                `zumi://auth-error?message=${encodeURIComponent(errorMessage)}`,
            );
        }
    }
}
