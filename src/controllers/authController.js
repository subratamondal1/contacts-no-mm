const Auth = require("../models/Auth");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const Contact = require("../models/Contact");
const User = require('../models/User');

const authController = {
  // Login user
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("Login attempt for email:", email);

      // Find user
      const user = await Auth.findOne({ email });
      console.log("User found:", user ? "Yes" : "No");

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log("Stored password type:", typeof user.password);
      console.log("Input password type:", typeof password);

      // First try direct comparison (for existing plain text passwords)
      const isPlainTextMatch = password === user.password;
      console.log("Plain text match:", isPlainTextMatch);

      if (isPlainTextMatch) {
        console.log("Upgrading plain text password to hash");
        // If it matches, we should hash it for future
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await Auth.findByIdAndUpdate(user._id, { password: hashedPassword });
      } else {
        // Try comparing with bcrypt
        console.log("Attempting bcrypt comparison");
        const isMatch = await bcrypt.compare(password, user.password);
        console.log("Bcrypt match:", isMatch);

        if (!isMatch) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
      }

      // Create token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Update last active
      await Auth.findByIdAndUpdate(user._id, {
        $set: { "stats.lastActive": new Date() },
      });

      // Don't send password back
      const userObject = user.toObject();
      delete userObject.password;

      console.log("Login successful for:", email);
      res.json({
        token,
        user: userObject,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: error.message });
    }
  },

  // Register new user (admin only)
  register: async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      // Check if user exists
      const existingUser = await Auth.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create new user
      const user = new Auth({
        name,
        email,
        password,
        role: role || "user",
      });

      await user.save();

      // Don't send password back
      const userObject = user.toObject();
      delete userObject.password;

      res.status(201).json(userObject);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Get current user
  getMe: async (req, res) => {
    try {
      const user = await Auth.findById(req.user.userId).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Error getting current user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Update current user
  updateUser: async (req, res) => {
    try {
      const { name, email, currentPassword, newPassword } = req.body;
      const user = await Auth.findById(req.user._id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update basic info
      if (name) user.name = name;
      if (email) user.email = email;

      // Update password if provided
      if (currentPassword && newPassword) {
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });
        }
        user.password = newPassword;
      }

      await user.save();

      // Don't send password back
      const userObject = user.toObject();
      delete userObject.password;

      res.json(userObject);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Get all users (admin only)
  getUsers: async (req, res) => {
    try {
      const users = await Auth.find({ role: 'user' }).select('-password');
      
      // Get contact counts for each user
      const usersWithCounts = await Promise.all(
        users.map(async (user) => {
          const assignedContacts = await Contact.countDocuments({ assignedTo: user._id });
          return {
            ...user.toObject(),
            assignedContacts
          };
        })
      );
      
      res.json(usersWithCounts);
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Delete user (admin only)
  deleteUser: async (req, res) => {
    try {
      const user = await Auth.findByIdAndDelete(req.params.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Get user stats
  getUserStats: async (req, res) => {
    try {
      const user = await Auth.findById(req.params.userId).select("stats").lean();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user.stats);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Login
  loginAlt: async (req, res) => {
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
  },

  // Create user (admin only)
  createUser: async (req, res) => {
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
  },

  // Get all users with statistics (admin only)
  getAllUsersWithStats: async (req, res) => {
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
  },

  // Get user details (admin only)
  getUserDetails: async (req, res) => {
    try {
      const userId = req.user._id;
      const user = await Auth.findById(userId).select("-password");

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
  },

  // Get user profile
  getUserProfile: async (req, res) => {
    try {
      const user = await Auth.findById(req.user.userId)
        .select("-password")
        .lean();
      const stats = await getUserStatistics(req.user.userId);
      const assignedContacts = await Auth.find({ assignedTo: req.user.userId })
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
  },

  // Assign contacts to user
  assignContacts: async (req, res) => {
    try {
      const { contactIds, userId } = req.body;
      console.log('Received request:', { contactIds, userId });

      if (!contactIds || !Array.isArray(contactIds) || !userId) {
        return res.status(400).json({ message: "Contact IDs must be an array and User ID is required" });
      }

      // First verify that all contactIds exist in users_data
      const validContacts = await User.find({ _id: { $in: contactIds } }).select('_id');
      const validContactIds = validContacts.map(c => c._id);

      if (validContactIds.length !== contactIds.length) {
        return res.status(400).json({ message: "Some contact IDs are invalid" });
      }

      // Update the auth user's assignedContacts field
      const authUser = await Auth.findByIdAndUpdate(
        userId,
        { 
          $addToSet: { 
            assignedContacts: { $each: validContactIds }
          },
          'stats.lastAssignment': new Date()
        },
        { new: true }
      ).populate('assignedContacts');

      if (!authUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log('Updated auth user:', authUser);

      // Update the assigned status in users_data collection
      const updateResult = await User.updateMany(
        { _id: { $in: validContactIds } },
        { 
          $set: { 
            assignedTo: userId,
            assignedAt: new Date(),
            isAssigned: true
          } 
        }
      );

      console.log('Update result:', updateResult);

      res.json({ 
        message: "Users data assigned successfully",
        assignedContacts: authUser.assignedContacts,
        user: {
          _id: authUser._id,
          name: authUser.name,
          email: authUser.email,
          assignedContactsCount: authUser.assignedContacts.length
        }
      });
    } catch (error) {
      console.error("Assign contacts error details:", {
        error: error.message,
        stack: error.stack,
        contactIds: req.body.contactIds,
        userId: req.body.userId
      });
      res.status(500).json({ 
        message: "Failed to assign contacts",
        error: error.message 
      });
    }
  },

  // Unassign contacts from user
  unassignContacts: async (req, res) => {
    try {
      const { userId, contactIds } = req.body;

      // Update contacts to remove assignment
      await Contact.updateMany(
        { _id: { $in: contactIds } },
        {
          assignedTo: null,
          assignmentDate: null,
          status: 'unassigned'
        }
      );

      // Remove contacts from user's assignedContacts array
      await Auth.findByIdAndUpdate(userId, {
        $pullAll: { assignedContacts: contactIds }
      });

      // Get updated assigned contacts count
      const updatedUser = await Auth.findById(userId).select('assignedContacts');
      const assignedContactsCount = updatedUser.assignedContacts.length;

      res.json({
        message: 'Contacts unassigned successfully',
        unassignedCount: contactIds.length,
        totalAssigned: assignedContactsCount
      });
    } catch (error) {
      console.error('Unassignment error:', error);
      res.status(500).json({ message: 'Failed to unassign contacts' });
    }
  },

  // Get user's assigned contacts
  getUserContacts: async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Find user and populate assigned contacts
      const user = await Auth.findById(userId)
        .select('assignedContacts')
        .populate('assignedContacts');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user.assignedContacts);
    } catch (error) {
      console.error('Get user contacts error:', error);
      res.status(500).json({ message: 'Failed to fetch contacts' });
    }
  },

  // Get current user's contacts
  getCurrentUserContacts: async (req, res) => {
    try {
      const userId = req.user._id;
      
      // Find user and populate assigned contacts
      const user = await Auth.findById(userId)
        .select('assignedContacts')
        .populate('assignedContacts');

      res.json(user.assignedContacts);
    } catch (error) {
      console.error('Get current user contacts error:', error);
      res.status(500).json({ message: 'Failed to fetch contacts' });
    }
  },

  // Get user statistics
  getUserStatsAlt: async (req, res) => {
    try {
      const userId = req.params.userId;
      const stats = await getUserStatistics(userId);
      res.json(stats);
    } catch (error) {
      console.error("Get user statistics error:", error);
      res.status(500).json({ message: "Failed to fetch user statistics" });
    }
  },

  // Get assigned contacts
  getAssignedContacts: async (req, res) => {
    try {
      const contacts = await Auth.find({ assignedTo: req.user.userId })
        .populate("assignedTo", "name email")
        .lean();

      res.json(contacts);
    } catch (error) {
      console.error("Get assigned contacts error:", error);
      res.status(500).json({ message: "Failed to fetch assigned contacts" });
    }
  },

  // Get user by ID (admin only)
  getUserById: async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await Auth.findById(userId)
        .select('-password')
        .lean();

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Get user statistics
      const stats = {
        assignedContacts: 0,
        totalCalls: 0,
        uniqueContactsCalled: 0,
        lastActive: user.stats?.lastActive || null,
        ...user.stats
      };

      res.json({
        ...user,
        statistics: stats
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({ message: 'Failed to fetch user details' });
    }
  },

  // Register new user
  registerNew: async (req, res) => {
    try {
      const { name, email, password, role = 'user' } = req.body;

      // Check if user already exists
      const existingUser = await Auth.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const user = new Auth({
        name,
        email,
        password: hashedPassword,
        role
      });

      await user.save();
      res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
      console.error('Error in register:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Login user
  loginNew: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Check if user exists
      const user = await Auth.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Create JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1d' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Error in login:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Get all users (admin only)
  getUsersNew: async (req, res) => {
    try {
      const users = await Auth.find({ role: 'user' }).select('-password');
      
      // Get contact counts for each user
      const usersWithCounts = await Promise.all(
        users.map(async (user) => {
          const assignedContacts = await Contact.countDocuments({ assignedTo: user._id });
          return {
            ...user.toObject(),
            assignedContacts
          };
        })
      );
      
      res.json(usersWithCounts);
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Assign contacts to user
  assignContactsNew: async (req, res) => {
    try {
      const { userId, contactIds } = req.body;

      // Validate user exists
      const user = await Auth.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Update all selected contacts
      await Contact.updateMany(
        { _id: { $in: contactIds } },
        { $set: { assignedTo: userId } }
      );

      res.json({ message: 'Contacts assigned successfully' });
    } catch (error) {
      console.error('Error assigning contacts:', error);
      res.status(500).json({ message: 'Failed to assign contacts' });
    }
  },

  // Get all users (admin only)
  getUsers: async (req, res) => {
    try {
      const users = await Auth.find({ role: 'user' })
        .select('name email role assignedContacts')
        .lean();

      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  },
};

// Helper function to get user statistics
async function getUserStatistics(userId) {
  try {
    // Convert userId to ObjectId if it's a string
    const userObjectId =
      typeof userId === "string" ? new ObjectId(userId) : userId;

    // Get assigned contacts count
    const assignedContacts = await Auth.countDocuments({
      assignedTo: userObjectId,
      isAssigned: true,
    });

    // Get total calls made by counting phoneStatuses where called is true
    const contacts = await Auth.find({
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

module.exports = authController;
