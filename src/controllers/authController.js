const Auth = require('../models/Auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await Auth.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Create token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Return user data (excluding password) and token
      const userData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      res.json({ token, user: userData });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  },

  register: async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      // Check if user exists
      let user = await Auth.findOne({ email });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create new user
      user = new Auth({
        name,
        email,
        password,
        role: role || 'user'
      });

      // Save user
      await user.save();

      // Create token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Return user data and token
      const userData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      res.status(201).json({ token, user: userData });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  },

  getProfile: async (req, res) => {
    try {
      const user = await Auth.findById(req.user.userId).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ message: 'Server error while fetching profile' });
    }
  },

  getAssignedContacts: async (req, res) => {
    try {
      const userId = req.user.userId;
      console.log('Fetching assigned contacts for user:', userId);

      // Get user with assigned contacts
      const user = await Auth.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      console.log('Found user with assigned contacts:', user.assignedContacts);

      // Fetch the actual contact data from users_data collection
      const contacts = await User.find({
        _id: { $in: user.assignedContacts }
      }).select('name pm_no enrollment_no phone_no_1 phone_no_2 phone_no_3 phone_no_4 address phoneStatuses');

      console.log('Found contacts:', contacts.length);

      // Format the response
      const formattedContacts = contacts.map(contact => ({
        _id: contact._id,
        name: contact.name,
        'pm no': contact.pm_no,
        'enrollment no': contact.enrollment_no,
        'phone no 1': contact.phone_no_1,
        'phone no 2': contact.phone_no_2,
        'phone no 3': contact.phone_no_3,
        'phone no 4': contact.phone_no_4,
        address: contact.address,
        phoneStatuses: contact.phoneStatuses || []
      }));

      res.json({ contacts: formattedContacts });
    } catch (error) {
      console.error('Error getting assigned contacts:', error);
      res.status(500).json({ message: 'Failed to get assigned contacts', error: error.message });
    }
  },

  updateCallStatus: async (req, res) => {
    try {
      const { contactId, phoneNumber, called } = req.body;
      const userId = req.user.userId;

      // First check if the contact is assigned to this user
      const user = await Auth.findById(userId);
      if (!user || !user.assignedContacts.includes(contactId)) {
        return res.status(403).json({ message: 'Not authorized to update this contact' });
      }

      // Update the contact's phone status
      const contact = await User.findById(contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      // Initialize phoneStatuses if it doesn't exist
      if (!contact.phoneStatuses) {
        contact.phoneStatuses = [];
      }

      // Find or create the status for this phone number
      const existingStatusIndex = contact.phoneStatuses.findIndex(
        status => status.number === phoneNumber
      );

      if (existingStatusIndex >= 0) {
        contact.phoneStatuses[existingStatusIndex] = {
          ...contact.phoneStatuses[existingStatusIndex],
          called: true,
          lastUpdated: new Date()
        };
      } else {
        contact.phoneStatuses.push({
          number: phoneNumber,
          called: true,
          lastUpdated: new Date()
        });
      }

      // Save the updated contact
      await contact.save();

      // Update user's stats
      user.stats = user.stats || {};
      user.stats.lastActive = new Date();
      user.stats.totalCallsMade = (user.stats.totalCallsMade || 0) + 1;
      await user.save();

      res.json({ 
        message: 'Call status updated successfully',
        contact: {
          _id: contact._id,
          name: contact.name,
          'pm no': contact.pm_no,
          'enrollment no': contact.enrollment_no,
          'phone no 1': contact.phone_no_1,
          'phone no 2': contact.phone_no_2,
          'phone no 3': contact.phone_no_3,
          'phone no 4': contact.phone_no_4,
          phoneStatuses: contact.phoneStatuses
        }
      });
    } catch (error) {
      console.error('Error updating call status:', error);
      res.status(500).json({ message: 'Failed to update call status', error: error.message });
    }
  },

  getUsers: async (req, res) => {
    try {
      const users = await Auth.find({ role: 'user' }).select('-password');
      res.json(users);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  },

  assignContacts: async (req, res) => {
    try {
      const { userId, contactIds } = req.body;

      // Verify user exists and is a regular user
      const user = await Auth.findById(userId);
      if (!user || user.role !== 'user') {
        return res.status(400).json({ message: 'Invalid user' });
      }

      // Update user's assigned contacts
      user.assignedContacts = contactIds;
      user.stats = user.stats || {};
      user.stats.lastAssignment = new Date();
      await user.save();

      // Update contacts' assigned status
      await User.updateMany(
        { _id: { $in: contactIds } },
        { 
          $set: { 
            assignedTo: userId,
            isAssigned: true,
            assignedAt: new Date()
          }
        }
      );

      res.json({ message: 'Contacts assigned successfully', user });
    } catch (error) {
      console.error('Assign contacts error:', error);
      res.status(500).json({ message: 'Failed to assign contacts' });
    }
  },
};

module.exports = authController;
