import { Router, Response, Request } from 'express';
import {
    AuthController,
    AuthenticatedRequest,
} from '../controllers/authController.js';
import auth from '../middlewares/auth.js';

interface GoogleAuthRequest extends Request {
    body: {
        googleToken: string;
    };
}

const router = Router();
const authController = new AuthController();

// Public routes - no auth required
router.post('/google', (req: Request, res: Response) => {
    authController.authenticate(req as GoogleAuthRequest, res);
});

// Mobile OAuth flow routes
router.get('/google/mobile', (req: Request, res: Response) => {
    authController.initiateMobileOAuth(req, res);
});

router.get('/google/callback', (req: Request, res: Response) => {
    authController.handleOAuthCallback(req, res);
});

// Protected routes - auth required
router.use(auth);

router.get('/profile', (req: Request, res: Response) => {
    return authController.getProfile(req as AuthenticatedRequest, res);
});

// PIN management routes
router.post('/profile/pin', (req: Request, res: Response) => {
    return authController.setPin(req as AuthenticatedRequest, res);
});

router.post('/profile/pin/verify', (req: Request, res: Response) => {
    return authController.verifyPin(req as AuthenticatedRequest, res);
});

router.delete('/profile/pin', (req: Request, res: Response) => {
    return authController.deletePin(req as AuthenticatedRequest, res);
});

export default router;
