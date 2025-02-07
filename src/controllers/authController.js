const Auth = require("../models/Auth");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const authController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await Auth.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Create token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Return user data (excluding password) and token
      const userData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      res.json({ token, user: userData });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error during login" });
    }
  },

  register: async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      // Check if user exists
      let user = await Auth.findOne({ email });
      if (user) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create new user
      user = new Auth({
        name,
        email,
        password,
        role: role || "user",
      });

      // Save user
      await user.save();

      // Create token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Return user data and token
      const userData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      res.status(201).json({ token, user: userData });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Server error during registration" });
    }
  },

  getProfile: async (req, res) => {
    try {
      const user = await Auth.findById(req.user.userId).select("-password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Server error while fetching profile" });
    }
  },

  getAssignedContacts: async (req, res) => {
    try {
      const userId = req.user.userId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search ? req.query.search.trim() : "";
      const skip = (page - 1) * limit;

      console.log('Search query:', search);

      // Get user with their assigned contacts
      const user = await Auth.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get only active contacts
      const activeAssignments = user.assignedContacts.filter(
        (a) => a.status === "active"
      );
      const activeContactIds = activeAssignments.map((a) => a.contact);

      // Build the base pipeline
      const pipeline = [
        {
          $match: {
            _id: { $in: activeContactIds }
          }
        }
      ];

      // Add search stage if search term exists
      if (search) {
        pipeline[0].$match.$and = [
          { _id: { $in: activeContactIds } },
          {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { "pm no": { $regex: search, $options: "i" } },
              { "enrollment no": { $regex: search, $options: "i" } },
              { "phone no 1": { $regex: search, $options: "i" } },
              { "phone no 2": { $regex: search, $options: "i" } },
              { "phone no 3": { $regex: search, $options: "i" } },
              { "phone no 4": { $regex: search, $options: "i" } },
              { address: { $regex: search, $options: "i" } }
            ]
          }
        ];
      }

      // Add pagination stages
      pipeline.push(
        { $sort: { name: 1 } },
        { $skip: skip },
        { $limit: limit }
      );

      console.log('MongoDB Pipeline:', JSON.stringify(pipeline, null, 2));

      // Execute the aggregation
      const contacts = await User.aggregate(pipeline);
      const total = await User.countDocuments(pipeline[0].$match);

      console.log(`Found ${contacts.length} contacts out of ${total} total`);

      // Process the contacts
      const contactsWithAssignmentData = contacts.map(contact => {
        const assignment = activeAssignments.find(
          (a) => a.contact.toString() === contact._id.toString()
        );
        return {
          ...contact,
          assignedAt: assignment.assignedAt,
          phoneStatuses: contact.phoneStatuses || [],
          "pm no": contact["pm no"] || 'Not Available',
          "enrollment no": contact["enrollment no"] || 'Not Available',
          "phone no 1": contact["phone no 1"] || null,
          "phone no 2": contact["phone no 2"] || null,
          "phone no 3": contact["phone no 3"] || null,
          "phone no 4": contact["phone no 4"] || null,
          address: contact.address || 'Not Available'
        };
      });

      // Send response with pagination info
      res.json({
        contacts: contactsWithAssignmentData,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
          pageSize: limit
        },
        stats: user.stats
      });
    } catch (error) {
      console.error("Error in getAssignedContacts:", error);
      res.status(500).json({
        message: "Failed to fetch assigned contacts",
        error: error.message
      });
    }
  },

  updateCallStatus: async (req, res) => {
    try {
      const { contactId, phoneNumber, called } = req.body;
      const userId = req.user.userId;

      // First check if the contact is assigned to this user
      const user = await Auth.findById(userId);
      if (!user || !user.assignedContacts.some((a) => a.contact.toString() === contactId)) {
        return res.status(403).json({ message: "Not authorized to update this contact" });
      }

      // Get both Contact and UsersData models
      const Contact = mongoose.model("Contact");
      const UsersData = mongoose.model("users_data", Contact.schema);

      // Get both documents
      const [contact, usersDataContact] = await Promise.all([
        Contact.findById(contactId),
        UsersData.findById(contactId)
      ]);

      if (!contact || !usersDataContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      // Function to update phone status
      const updatePhoneStatus = (doc) => {
        if (!doc.phoneStatuses) {
          doc.phoneStatuses = [];
        }

        let phoneStatus = doc.phoneStatuses.find(
          (status) => status.number === phoneNumber
        );

        const wasPreviouslyCalled = phoneStatus?.called || false;

        if (!phoneStatus) {
          phoneStatus = {
            number: phoneNumber,
            called: called,
            calledBy: called ? userId : null,
            lastCalled: called ? new Date() : null
          };
          doc.phoneStatuses.push(phoneStatus);
        } else {
          phoneStatus.called = called;
          if (called) {
            phoneStatus.calledBy = userId;
            phoneStatus.lastCalled = new Date();
          }
        }

        return !wasPreviouslyCalled && called; // Return true if this is a new call
      };

      // Update both documents
      const isNewCall = updatePhoneStatus(contact);
      updatePhoneStatus(usersDataContact);

      // Update user's stats only when a new call is made
      if (isNewCall) {
        user.stats = user.stats || {};
        user.stats.lastActive = new Date();
        user.stats.totalCallsMade = (user.stats.totalCallsMade || 0) + 1;

        // Update unique contacts called
        const uniquePhonesCalled = new Set(
          contact.phoneStatuses
            .filter(status => status.called && status.calledBy?.toString() === userId)
            .map(status => status.number)
        );
        user.stats.uniqueContactsCalled = uniquePhonesCalled.size;
      }

      // Save all updates atomically
      await Promise.all([
        contact.save(),
        usersDataContact.save(),
        user.save()
      ]);

      res.json({
        success: true,
        message: "Call status updated successfully",
        contact: {
          _id: contact._id,
          name: contact.name,
          "pm no": contact["pm no"],
          "enrollment no": contact["enrollment no"],
          "phone no 1": contact["phone no 1"],
          "phone no 2": contact["phone no 2"],
          "phone no 3": contact["phone no 3"],
          "phone no 4": contact["phone no 4"],
          phoneStatuses: contact.phoneStatuses,
        },
        stats: user.stats,
        isNewCall
      });
    } catch (error) {
      console.error("Error updating call status:", error);
      res.status(500).json({
        message: "Failed to update call status",
        error: error.message,
      });
    }
  },

  getUsers: async (req, res) => {
    try {
      const users = await Auth.find({ role: "user" }).select("-password");
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  },

  assignContacts: async (req, res) => {
    try {
      const { userId, contactIds } = req.body;

      // Verify user exists and is a regular user
      const user = await Auth.findById(userId);
      if (!user || user.role !== "user") {
        return res.status(400).json({ message: "Invalid user" });
      }

      // Get current assigned contacts
      const currentAssignments = user.assignedContacts || [];

      // Create new contact assignments
      const newAssignments = contactIds.map((contactId) => ({
        contact: contactId,
        assignedAt: new Date(),
        status: "active",
      }));

      // Combine existing and new assignments
      const updatedAssignments = [...currentAssignments, ...newAssignments];

      // Update user's assigned contacts and stats
      user.assignedContacts = updatedAssignments;
      user.stats = user.stats || {};
      user.stats.lastAssignment = new Date();
      user.stats.totalAssignedContacts = updatedAssignments.length;
      user.stats.activeAssignedContacts = updatedAssignments.filter(
        (a) => a.status === "active"
      ).length;

      await user.save();

      // Update contacts' assigned status
      await User.updateMany(
        { _id: { $in: contactIds } },
        {
          $set: {
            assignedTo: userId,
            isAssigned: true,
            assignedAt: new Date(),
          },
        }
      );

      res.json({
        message: "Contacts assigned successfully",
        totalAssigned: user.stats.totalAssignedContacts,
        activeAssigned: user.stats.activeAssignedContacts,
      });
    } catch (error) {
      console.error("Assign contacts error:", error);
      res
        .status(500)
        .json({ message: "Failed to assign contacts", error: error.message });
    }
  },
};

module.exports = authController;
