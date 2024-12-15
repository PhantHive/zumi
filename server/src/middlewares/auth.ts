import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

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
        console.log('Auth header:', authHeader); // Debug log

        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        console.log('Extracted token:', token ? 'exists' : 'null'); // Debug log

        if (!token) {
            res.status(401).json({
                error: 'Please authenticate - No token provided',
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
            console.log('Decoded token userId:', decoded.userId); // Debug log

            const user = await User.findById(decoded.userId);
            console.log('Found user:', user ? 'yes' : 'no'); // Debug log

            if (!user) {
                res.status(401).json({
                    error: 'Please authenticate - User not found',
                });
                return;
            }

            req.user = user;
            next();
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            res.status(401).json({
                error: 'Please authenticate - Invalid token',
            });
            return;
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Please authenticate - Server error' });
    }
};

export default auth;
