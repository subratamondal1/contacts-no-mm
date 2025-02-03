const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contactController");
const { authenticate } = require("../middleware/auth");

// Public routes
router.post("/", contactController.createContact);

// Protected routes
router.get("/", authenticate, contactController.getContacts);
router.get("/stats", authenticate, contactController.getStats);
router.get("/assigned", authenticate, contactController.getAssignedContacts);
router.put("/:id/status", authenticate, contactController.updateStatus);
router.put("/assign", authenticate, contactController.assignContacts);

module.exports = router;
