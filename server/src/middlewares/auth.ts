import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

interface JwtPayload {
    userId: string;
}

const auth = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        console.log('Auth header:', authHeader); // Log full header

        // Validate header format
        if (!authHeader) {
            res.status(401).json({
                error: 'No authorization header found',
            });
            return;
        }

        if (!authHeader.startsWith('Bearer ')) {
            console.log(
                'Invalid header format. Expected "Bearer", got:',
                authHeader.split(' ')[0],
            );
            res.status(401).json({
                error: 'Invalid authorization header format',
            });
            return;
        }

        const token = authHeader.substring(7);

        // Log token structure
        const tokenParts = token.split('.');
        console.log('Token parts count:', tokenParts.length);
        console.log('Token structure validation:');
        console.log('- Has header:', !!tokenParts[0]);
        console.log('- Has payload:', !!tokenParts[1]);
        console.log('- Has signature:', !!tokenParts[2]);

        if (tokenParts.length !== 3) {
            res.status(401).json({
                error:
                    'Malformed token structure. Expected 3 parts, got: ' +
                    tokenParts.length,
            });
            return;
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET not configured in environment');
            throw new Error('JWT_SECRET is not defined');
        }

        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET,
            ) as JwtPayload;
            console.log('Token successfully decoded. UserId:', decoded.userId);

            const user = await User.findById(decoded.userId);
            if (!user) {
                res.status(401).json({
                    error: 'User not found',
                });
                return;
            }

            req.user = user;
            next();
        } catch (jwtError: unknown) {
            if (!(jwtError instanceof Error)) {
                console.error('JWT verification error:', jwtError);
                res.status(401).json({
                    error: 'Token verification failed',
                });
                return;
            }
            console.error('JWT verification details:', {
                error: jwtError.message,
                name: jwtError.name,
                stack: jwtError.stack,
            });
            res.status(401).json({
                error: `Token verification failed: ${jwtError.message}`,
            });
            return;
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Server authentication error' });
    }
};

export default auth;

// Optional auth middleware for video streaming that accepts token from query params
export const optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        console.log('[OPTIONAL AUTH] Query params:', req.query);
        console.log('[OPTIONAL AUTH] Authorization header:', req.headers.authorization);

        // Try to get token from query param first (for video elements)
        let token = req.query.token as string;

        // If no query token, try Authorization header
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        console.log('[OPTIONAL AUTH] Token found:', token ? 'YES' : 'NO');
        console.log('[OPTIONAL AUTH] Token length:', token?.length || 0);

        if (!token) {
            console.log('[OPTIONAL AUTH] No token found, rejecting request');
            res.status(401).json({
                error: 'No authorization token found',
            });
            return;
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET not configured in environment');
            throw new Error('JWT_SECRET is not defined');
        }

        try {
            console.log('[OPTIONAL AUTH] Attempting to verify token...');
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET,
            ) as JwtPayload;

            console.log('[OPTIONAL AUTH] Token verified successfully. UserId:', decoded.userId);

            const user = await User.findById(decoded.userId);
            if (!user) {
                console.log('[OPTIONAL AUTH] User not found for userId:', decoded.userId);
                res.status(401).json({
                    error: 'User not found',
                });
                return;
            }

            console.log('[OPTIONAL AUTH] User found:', user.email);
            req.user = user;
            next();
        } catch (jwtError: unknown) {
            if (!(jwtError instanceof Error)) {
                console.error('[OPTIONAL AUTH] JWT verification error:', jwtError);
                res.status(401).json({
                    error: 'Token verification failed',
                });
                return;
            }
            console.error('[OPTIONAL AUTH] JWT verification failed:', jwtError.message);
            res.status(401).json({
                error: `Token verification failed: ${jwtError.message}`,
            });
            return;
        }
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        res.status(401).json({ error: 'Server authentication error' });
    }
};

