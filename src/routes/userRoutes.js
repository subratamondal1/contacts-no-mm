const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Log all route access
router.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

// Protected routes - all routes require authentication
router.use(authenticate);

// Get all users
router.get('/users', async (req, res, next) => {
  console.log('Accessing /users endpoint');
  try {
    await userController.getUsers(req, res);
  } catch (error) {
    next(error);
  }
});

// Get user by ID
router.get('/users/:id', async (req, res, next) => {
  try {
    await userController.getUserById(req, res);
  } catch (error) {
    next(error);
  }
});

// Get all contacts (paginated)
router.get('/contacts', authenticate, userController.getContacts);

// Toggle call status for a contact
router.post('/:id/toggle-call', authenticate, userController.togglePhoneCalled);

// Get user statistics
router.get('/:id/statistics', authenticate, async (req, res) => {
  try {
    const stats = await userController.getUserStatistics(req.params.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting user statistics:', error);
    res.status(500).json({ message: 'Failed to get user statistics' });
  }
});

// Get assigned contacts for a user
router.get('/:id/assigned-contacts', authenticate, async (req, res) => {
  try {
    const contacts = await userController.getAssignedContacts(req.params.id);
    res.json(contacts);
  } catch (error) {
    console.error('Error getting assigned contacts:', error);
    res.status(500).json({ message: 'Failed to get assigned contacts' });
  }
});

// Get assigned contacts
router.get('/assigned-contacts', authenticate, userController.getAssignedContacts);

// Toggle called status
router.put('/users/:id/toggle-called', async (req, res, next) => {
  try {
    await userController.togglePhoneCalled(req, res);
  } catch (error) {
    next(error);
  }
});

// Get statistics
router.get('/stats', async (req, res, next) => {
  try {
    await userController.getStats(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
