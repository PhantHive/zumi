import { Router, Response, Request } from 'express';
import { AuthController, AuthenticatedRequest } from '../controllers/authController';
import auth from "../middlewares/auth.ts";

const router = Router();
const authController = new AuthController();

router.use(auth);

router.post('/google', (req: Request, res: Response) => {
    authController.authenticate(req as AuthenticatedRequest, res);
});

router.get('/profile', (req: Request, res: Response) => {
    return authController.getProfile(req as AuthenticatedRequest, res);
});

export default router;