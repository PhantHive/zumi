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

// Public route - no auth required
router.post('/google', (req: Request, res: Response) => {
    authController.authenticate(req as GoogleAuthRequest, res);
});

// Protected routes - auth required
router.use(auth);

router.get('/profile', (req: Request, res: Response) => {
    return authController.getProfile(req as AuthenticatedRequest, res);
});

export default router;
