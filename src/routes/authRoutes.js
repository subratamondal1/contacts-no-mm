const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate, isAdmin } = require("../middleware/auth");

// Public routes
router.post("/login", authController.login);

// Protected routes - require authentication
router.use(authenticate);

// Admin only routes
router.post("/users", isAdmin, authController.createUser);
router.get("/users", isAdmin, authController.getAllUsers);
router.get("/users/:userId", isAdmin, authController.getUserDetails);
router.post("/assign-contacts", isAdmin, authController.assignContacts);
router.post("/unassign-contacts", isAdmin, authController.unassignContacts);

// User routes - accessible by both admin and regular users
router.get("/stats/:userId", authController.getUserStats);
router.get("/assigned-contacts", authController.getAssignedContacts);
router.get("/profile", authController.getUserProfile);

module.exports = router;
