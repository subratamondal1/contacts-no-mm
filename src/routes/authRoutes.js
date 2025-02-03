const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected routes - require authentication
router.get('/me', authenticate, authController.getProfile);
router.get('/assigned-contacts', authenticate, authController.getAssignedContacts);
router.post('/update-call-status', authenticate, authController.updateCallStatus);

// Admin only routes
router.get('/users', authenticate, isAdmin, authController.getUsers);
router.post('/assign-contacts', authenticate, isAdmin, authController.assignContacts);

module.exports = router;
