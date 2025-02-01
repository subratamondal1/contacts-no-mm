const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);

// Admin only routes
router.post('/users', authenticate, isAdmin, authController.createUser);
router.get('/users', authenticate, isAdmin, authController.getAllUsers);
router.post('/assign-contacts', authenticate, isAdmin, authController.assignContacts);
router.post('/unassign-contacts', authenticate, isAdmin, authController.unassignContacts);

// User routes
router.get('/assigned-contacts', authenticate, authController.getAssignedContacts);
router.get('/stats/:userId', authenticate, authController.getUserStats);

module.exports = router;
