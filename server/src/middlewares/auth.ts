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
