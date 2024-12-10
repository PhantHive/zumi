import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router = Router();
const authController = new AuthController();

router.post('/google', (req, res) => {
    authController.authenticate(req, res);
});

export default router;
