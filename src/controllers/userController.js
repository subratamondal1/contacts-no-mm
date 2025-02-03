const User = require('../models/User');
const Contact = require('../models/Contact');
const mongoose = require('mongoose');

const userController = {
  // Get contacts with pagination and search
  getContacts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const search = req.query.search || '';

      console.log('Getting contacts with:', { page, limit, search });
      
      // Build search query
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'pm no': { $regex: search, $options: 'i' } },
          { 'enrollment no': { $regex: search, $options: 'i' } }
        ];
      }

      console.log('Search query:', query);

      // Use the users_data collection
      const UsersData = mongoose.model('users_data', Contact.schema);

      // Get total count
      const total = await UsersData.countDocuments(query);
      console.log('Total contacts:', total);

      // Calculate skip for pagination
      const skip = (page - 1) * limit;
      console.log('Skip:', skip, 'Limit:', limit);

      // Get paginated contacts
      const contacts = await UsersData.find(query)
        .sort({ 'sl no': 1 }) // Sort by serial number
        .skip(skip)
        .limit(limit)
        .lean();

      console.log('Found contacts:', contacts.length);

      // Get all users for mapping assignments
      const users = await User.find({}, 'name email').lean();
      console.log('Found users for mapping:', users.length);

      // Map contacts with user assignments and ensure all fields exist
      const mappedContacts = contacts.map(contact => {
        const assignedUser = contact.assignedTo ? 
          users.find(u => u._id.toString() === contact.assignedTo.toString()) : null;

        // Ensure all phone numbers exist (even if null)
        const phoneNumbers = ['phone no 1', 'phone no 2', 'phone no 3', 'phone no 4'];
        phoneNumbers.forEach(key => {
          if (!(key in contact)) {
            contact[key] = null;
          }
        });

        return {
          ...contact,
          assignedToName: assignedUser?.name || null,
          phoneStatuses: contact.phoneStatuses || [],
          isAssigned: !!contact.assignedTo
        };
      });

      console.log('Mapped contacts:', mappedContacts.length);

      // Return formatted response
      res.json({
        users: mappedContacts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error in getContacts:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to fetch contacts',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Get users data (alias for getContacts for backward compatibility)
  getUsersData: async (req, res) => {
    return userController.getContacts(req, res);
  },

  // Toggle phone called status
  togglePhoneCalled: async (req, res) => {
    try {
      const UsersData = mongoose.model('users_data', Contact.schema);
      const user = await UsersData.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      let phoneStatus = user.phoneStatuses?.find(
        (status) => status.number === phoneNumber
      );
      
      if (!phoneStatus) {
        if (!user.phoneStatuses) {
          user.phoneStatuses = [];
        }
        phoneStatus = {
          number: phoneNumber,
          called: false,
          calledBy: null,
          lastCalled: null
        };
        user.phoneStatuses.push(phoneStatus);
      }

      phoneStatus.called = !phoneStatus.called;
      if (phoneStatus.called) {
        phoneStatus.calledBy = req.user._id;
        phoneStatus.lastCalled = new Date();
      }

      await user.save();
      res.json(user);
    } catch (error) {
      console.error('Error in togglePhoneCalled:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to toggle phone status',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Get statistics
  getStatistics: async (req, res) => {
    try {
      const userId = req.user._id;
      const UsersData = mongoose.model('users_data', Contact.schema);

      // Get assigned contacts count
      const assignedContacts = await UsersData.countDocuments({
        assignedTo: userId,
        isAssigned: true
      });

      // Get total calls made and unique contacts called
      const contacts = await UsersData.find({
        assignedTo: userId,
        isAssigned: true,
        "phoneStatuses.called": true
      });

      let totalCallsMade = 0;
      const uniqueContactsSet = new Set();

      contacts.forEach((contact) => {
        const calledNumbers = contact.phoneStatuses.filter(
          (status) => status.called && status.calledBy.toString() === userId.toString()
        );
        totalCallsMade += calledNumbers.length;
        if (calledNumbers.length > 0) {
          uniqueContactsSet.add(contact._id.toString());
        }
      });

      res.json({
        assignedContacts,
        totalCallsMade,
        uniqueContactsCalled: uniqueContactsSet.size
      });
    } catch (error) {
      console.error('Error in getStatistics:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to fetch statistics',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Get assigned contacts
  getAssignedContacts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const search = req.query.search || '';
      const userId = req.user._id;

      const UsersData = mongoose.model('users_data', Contact.schema);
      let query = { assignedTo: userId };

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'pm no': { $regex: search, $options: 'i' } },
          { 'enrollment no': { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;

      const [contacts, total] = await Promise.all([
        UsersData.find(query)
          .sort({ 'sl no': 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UsersData.countDocuments(query)
      ]);

      res.json({
        contacts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error in getAssignedContacts:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to fetch assigned contacts',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Assign contacts
  assignContacts: async (req, res) => {
    try {
      const { contactIds, userId } = req.body;

      if (!contactIds || !userId) {
        return res.status(400).json({ message: 'Contact IDs and User ID are required' });
      }

      const UsersData = mongoose.model('users_data', Contact.schema);
      
      // Update contacts
      await UsersData.updateMany(
        { _id: { $in: contactIds } },
        { 
          $set: { 
            assignedTo: userId,
            isAssigned: true,
            assignedAt: new Date()
          }
        }
      );

      res.json({ message: 'Contacts assigned successfully' });
    } catch (error) {
      console.error('Error in assignContacts:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to assign contacts',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Unassign contacts
  unassignContacts: async (req, res) => {
    try {
      const { contactIds } = req.body;

      if (!contactIds || !Array.isArray(contactIds)) {
        return res.status(400).json({ message: 'Contact IDs are required' });
      }

      const UsersData = mongoose.model('users_data', Contact.schema);
      
      await UsersData.updateMany(
        { _id: { $in: contactIds } },
        { 
          $unset: { assignedTo: '', assignedAt: '' },
          $set: { isAssigned: false }
        }
      );

      res.json({ message: 'Contacts unassigned successfully' });
    } catch (error) {
      console.error('Error in unassignContacts:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to unassign contacts',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Get all users
  getUsers: async (req, res) => {
    try {
      const users = await User.find({ role: { $in: ['user', 'admin'] } })
        .select('_id name email role')
        .sort({ name: 1 })
        .lean();

      res.json(users);
    } catch (error) {
      console.error('Error in getUsers:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to fetch users',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }
};

module.exports = userController;
