const Auth = require("../models/Auth");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await Auth.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (password !== user.password) {
      // In production, use proper password hashing
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login" });
  }
};

// Create user (admin only)
exports.createUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await Auth.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const user = new Auth({
      email,
      password, // In production, hash the password
      role: "user",
      name,
    });

    await user.save();

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
};

// Get all users with statistics (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await Auth.find({ role: "user" }).select("-password").lean();

    // Get statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const stats = await getUserStatistics(user._id);
        return {
          ...user,
          statistics: stats,
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// Get user details (admin only)
exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user statistics
    const statistics = await getUserStatistics(userId);

    res.json({
      user,
      statistics,
    });
  } catch (error) {
    console.error("Get user details error:", error);
    res.status(500).json({ message: "Failed to fetch user details" });
  }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await Auth.findById(req.user.userId)
      .select("-password")
      .lean();
    const stats = await getUserStatistics(req.user.userId);
    const assignedContacts = await User.find({ assignedTo: req.user.userId })
      .select("name pmNo enrollmentNo")
      .lean();

    res.json({
      ...user,
      statistics: stats,
      assignedContacts,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
};

// Assign contacts to user (admin only)
exports.assignContacts = async (req, res) => {
  try {
    const { userId, contactIds } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Validate contactIds
    const validContactIds = contactIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (validContactIds.length !== contactIds.length) {
      return res.status(400).json({ message: "Invalid contact IDs" });
    }

    // Check if user exists
    const user = await Auth.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if contacts are already assigned
    const alreadyAssigned = await User.findOne({
      _id: { $in: validContactIds },
      isAssigned: true,
      assignedTo: { $ne: userId },
    });

    if (alreadyAssigned) {
      return res.status(400).json({
        message: "Some contacts are already assigned to other users",
      });
    }

    // Update contacts
    await User.updateMany(
      { _id: { $in: validContactIds } },
      {
        $set: {
          assignedTo: userId,
          assignedAt: new Date(),
          isAssigned: true,
        },
      }
    );

    res.json({ message: "Contacts assigned successfully" });
  } catch (error) {
    console.error("Assign contacts error:", error);
    res.status(500).json({ message: "Failed to assign contacts" });
  }
};

// Unassign contacts (admin only)
exports.unassignContacts = async (req, res) => {
  try {
    const { contactIds } = req.body;

    // Validate contactIds
    const validContactIds = contactIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (validContactIds.length !== contactIds.length) {
      return res.status(400).json({ message: "Invalid contact IDs" });
    }

    await User.updateMany(
      { _id: { $in: validContactIds } },
      {
        $set: {
          assignedTo: null,
          assignedAt: null,
          isAssigned: false,
        },
      }
    );

    res.json({ message: "Contacts unassigned successfully" });
  } catch (error) {
    console.error("Unassign contacts error:", error);
    res.status(500).json({ message: "Failed to unassign contacts" });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.params.userId;
    const stats = await getUserStatistics(userId);
    res.json(stats);
  } catch (error) {
    console.error("Get user statistics error:", error);
    res.status(500).json({ message: "Failed to fetch user statistics" });
  }
};

// Get assigned contacts
exports.getAssignedContacts = async (req, res) => {
  try {
    const contacts = await User.find({ assignedTo: req.user.userId })
      .populate("assignedTo", "name email")
      .lean();

    res.json(contacts);
  } catch (error) {
    console.error("Get assigned contacts error:", error);
    res.status(500).json({ message: "Failed to fetch assigned contacts" });
  }
};

// Helper function to get user statistics
async function getUserStatistics(userId) {
  try {
    // Convert userId to ObjectId if it's a string
    const userObjectId =
      typeof userId === "string" ? new ObjectId(userId) : userId;

    // Get assigned contacts count
    const assignedContacts = await User.countDocuments({
      assignedTo: userObjectId,
      isAssigned: true,
    });

    // Get total calls made by counting phoneStatuses where called is true
    const contacts = await User.find({
      assignedTo: userObjectId,
      isAssigned: true,
      phoneStatuses: { $exists: true, $ne: [] },
    });

    let totalCallsMade = contacts.reduce((total, contact) => {
      return (
        total +
        (contact.phoneStatuses?.filter((status) => status.called)?.length || 0)
      );
    }, 0);

    return {
      assignedContacts,
      totalCallsMade,
    };
  } catch (error) {
    console.error("Error getting user statistics:", error);
    throw error;
  }
}
