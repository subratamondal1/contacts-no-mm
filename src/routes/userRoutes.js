const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// Protected routes - all routes require authentication
router.use(authenticate);

// Get all users data with pagination and search
router.get("/users-data", userController.getUsersData);

// Get contacts with pagination and filters
router.get("/contacts", userController.getContacts);

// Get assigned contacts
router.get("/assigned-contacts", userController.getAssignedContacts);

// Assign contacts
router.post("/assign-contacts", userController.assignContacts);

// Unassign contacts
router.post("/unassign-contacts", userController.unassignContacts);

// Get all users
router.get("/users", userController.getUsers);

// Toggle phone called status
router.put("/contacts/:id/toggle-called", userController.togglePhoneCalled);

// Get statistics
router.get("/stats", userController.getStatistics);

module.exports = router;
