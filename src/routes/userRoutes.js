const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Log all route access
router.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

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
