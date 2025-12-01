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
     * GET /api/auth/google/mobile?scheme=zumi
     */
    async initiateMobileOAuth(req: Request, res: Response): Promise<void> {
        console.log('=== Initiating Mobile OAuth Flow ===');

        try {
            // Get scheme from query params, default to 'zumi'
            const scheme = (req.query.scheme as string) || 'zumi';
            console.log('Deep link scheme:', scheme);

            // Generate random state for CSRF protection
            const state = crypto.randomBytes(32).toString('hex');

            // Store state with scheme and 10 minute expiration
            stateStore.set(state, 'pending', 10, scheme);

            const clientId = process.env.GOOGLE_CLIENT_ID;

            // Use BACKEND_URL if available (for domain-based setup), otherwise fall back to IP
            const backendUrl =
                process.env.BACKEND_URL ||
                `http://${process.env.VPS_IP}:${process.env.API_PORT}`;
            const redirectUri = `${backendUrl}/api/auth/google/callback`;

            console.log('Backend URL:', backendUrl);
            console.log('Redirect URI being sent to Google:', redirectUri);
            console.log('Generated state:', state);

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

            console.log('Redirecting user to Google OAuth URL');

            // Redirect user to Google OAuth
            res.redirect(googleAuthUrl.toString());
        } catch (error) {
            console.error('Error initiating OAuth:', error);
            const scheme = (req.query.scheme as string) || 'zumi';
            res.redirect(
                `${scheme}://auth-error?message=${encodeURIComponent('Failed to initiate authentication')}`,
            );
        }
    }

    /**
     * Handles OAuth callback from Google
     * GET /api/auth/google/callback
     */
    async handleOAuthCallback(req: Request, res: Response): Promise<void> {
        console.log('=== OAuth Callback Received ===');
        console.log('Query params:', req.query);

        try {
            const { code, state } = req.query;

            // Validate state parameter
            if (!state || typeof state !== 'string') {
                console.error(
                    'State validation failed: missing or invalid state',
                );
                throw new Error('Missing state parameter');
            }

            const storedState = stateStore.get(state);
            if (!storedState) {
                console.error(
                    'State validation failed: state not found in store',
                );
                throw new Error('Invalid or expired state parameter');
            }

            console.log('State validated successfully');

            // Delete state after verification (one-time use)
            stateStore.delete(state);

            // Validate code parameter
            if (!code || typeof code !== 'string') {
                console.error(
                    'Code validation failed: missing authorization code',
                );
                throw new Error('Missing authorization code');
            }

            console.log('Authorization code received');

            // Exchange code for access token
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            // Use BACKEND_URL if available (for domain-based setup), otherwise fall back to IP
            const backendUrl =
                process.env.BACKEND_URL ||
                `http://${process.env.VPS_IP}:${process.env.API_PORT}`;
            const redirectUri = `${backendUrl}/api/auth/google/callback`;

            console.log('Using redirect URI:', redirectUri);

            if (!clientId || !clientSecret) {
                throw new Error('Google OAuth credentials not configured');
            }

            console.log('Exchanging code for access token...');

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

            console.log('Access token received successfully');

            // Get user info using access token
            console.log('Fetching user info from Google...');

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
                console.error('Failed to fetch user info from Google');
                throw new Error('Failed to get user info from Google');
            }

            const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
            console.log('User info received:', {
                email: userInfo.email,
                name: userInfo.name,
            });

            // Find or create user
            let user = await User.findByGoogleId(userInfo.id);

            if (!user) {
                console.log('User not found, creating new user...');
                const userData: CreateUserDTO = {
                    googleId: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                };

                user = await User.createWithGoogle(userData);
                console.log('Created new user:', user.id);
            } else {
                console.log('Existing user found:', user.id);
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

            console.log('JWT token generated for user:', user.id);

            // Prepare user data for mobile app
            const userData = JSON.stringify({
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
            });

            // Retrieve the stored scheme from state
            const scheme = storedState.scheme || 'zumi://auth-success';
            console.log('Using deep link scheme:', scheme);

            // Build deep link for mobile app
            // If scheme already contains the full path (e.g., exp://192.168.1.148:8081/--/auth-success),
            // just append query params. Otherwise, build the full URL (for zumi://auth-success)
            const deepLink = scheme.includes('://')
                ? `${scheme}?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userData)}`
                : `${scheme}://auth-success?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userData)}`;

            console.log('=== Sending HTML redirect page ===');
            console.log('Deep link:', deepLink);
            console.log('Token length:', token.length);
            console.log('User data:', userData);

            // Return HTML page with clickable button to trigger deep link
            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In Successful</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem;
        }
        .container {
            text-align: center;
            max-width: 400px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 1.75rem;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }
        p {
            font-size: 1rem;
            opacity: 0.9;
            margin-bottom: 2rem;
            line-height: 1.5;
        }
        .button {
            display: inline-block;
            padding: 1rem 2rem;
            background: white;
            color: #667eea;
            text-decoration: none;
            border-radius: 12px;
            font-size: 1.125rem;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        .button:active {
            transform: translateY(0);
        }
        .help {
            margin-top: 2rem;
            font-size: 0.875rem;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✅</div>
        <h1>Sign In Successful!</h1>
        <p>You've successfully signed in with Google. Tap the button below to return to Zumi.</p>
        <a href="${deepLink}" class="button">Open Zumi App</a>
        <p class="help">Make sure Expo Go is installed on your device</p>
    </div>
</body>
</html>
`;

            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (error) {
            console.error('=== OAuth callback error ===');
            console.error('Error details:', error);
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Authentication failed';

            // Use default scheme for error if state lookup failed
            const errorScheme = 'zumi';
            const errorDeepLink = `${errorScheme}://auth-error?message=${encodeURIComponent(errorMessage)}`;
            console.log('Sending error redirect page');

            // Return error page with clickable button to return to app
            const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 1rem;
        }
        .container {
            text-align: center;
            max-width: 400px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 1.75rem;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }
        p {
            font-size: 1rem;
            opacity: 0.9;
            margin-bottom: 2rem;
            line-height: 1.5;
        }
        .button {
            display: inline-block;
            padding: 1rem 2rem;
            background: white;
            color: #f5576c;
            text-decoration: none;
            border-radius: 12px;
            font-size: 1.125rem;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        .button:active {
            transform: translateY(0);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">⚠️</div>
        <h1>Authentication Failed</h1>
        <p>${errorMessage}</p>
        <a href="${errorDeepLink}" class="button">Return to App</a>
    </div>
</body>
</html>
`;

            res.setHeader('Content-Type', 'text/html');
            res.status(400).send(errorHtml);
        }
    }
}
