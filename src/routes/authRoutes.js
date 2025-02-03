const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);

// Protected routes - require authentication
router.get('/me', authenticate, authController.getMe);

// Admin only routes
router.post('/register', authenticate, isAdmin, authController.register);
router.get('/users', authenticate, isAdmin, authController.getUsers);
router.post('/assign-contacts', authenticate, isAdmin, authController.assignContacts);

module.exports = router;
