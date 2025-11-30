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
        console.log('=== Initiating Mobile OAuth Flow ===');

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

            // Build deep link for mobile app
            const deepLink = `zumi://auth-success?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userData)}`;

            console.log('=== Sending HTML redirect page ===');
            console.log('Deep link scheme: zumi://auth-success');
            console.log('Token length:', token.length);
            console.log('User data:', userData);

            // Return HTML page with JavaScript to trigger deep link
            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting to Zumi...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 { margin: 0 0 1rem; font-size: 1.5rem; }
        p { margin: 0.5rem 0; opacity: 0.9; }
        .error {
            display: none;
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
        }
        .error.show { display: block; }
        button {
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover {
            background: rgba(255, 255, 255, 0.9);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>Authentication Successful!</h1>
        <p>Redirecting you back to the Zumi app...</p>
        <div class="error" id="error">
            <p>If you're not automatically redirected:</p>
            <button onclick="openApp()">Open Zumi App</button>
        </div>
    </div>
    <script>
        const deepLink = ${JSON.stringify(deepLink)};
        
        function openApp() {
            console.log('Opening deep link:', deepLink);
            window.location.href = deepLink;
        }
        
        // Attempt to open the deep link immediately
        console.log('Attempting deep link redirect...');
        openApp();
        
        // Show manual option after 2 seconds if still on this page
        setTimeout(function() {
            console.log('Deep link may not have worked, showing manual button');
            document.getElementById('error').classList.add('show');
        }, 2000);
    </script>
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

            // Return error page with deep link to error handler
            const errorDeepLink = `zumi://auth-error?message=${encodeURIComponent(errorMessage)}`;
            console.log('Sending error redirect page');

            const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
            max-width: 400px;
        }
        h1 { margin: 0 0 1rem; font-size: 1.5rem; }
        p { margin: 0.5rem 0; opacity: 0.9; }
        .error-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        button {
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: white;
            color: #f5576c;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover {
            background: rgba(255, 255, 255, 0.9);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">⚠️</div>
        <h1>Authentication Failed</h1>
        <p>${errorMessage}</p>
        <button onclick="window.location.href=${JSON.stringify(errorDeepLink)}">Return to App</button>
    </div>
    <script>
        // Auto-redirect after 3 seconds
        setTimeout(function() {
            window.location.href = ${JSON.stringify(errorDeepLink)};
        }, 3000);
    </script>
</body>
</html>
`;

            res.setHeader('Content-Type', 'text/html');
            res.status(400).send(errorHtml);
        }
    }
}
