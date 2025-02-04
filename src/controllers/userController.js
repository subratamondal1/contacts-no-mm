const User = require("../models/User");
const Contact = require("../models/Contact");
const mongoose = require("mongoose");

const userController = {
  // Get contacts with pagination and search
  getContacts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const search = req.query.search || "";

      console.log("Getting contacts with:", { page, limit, search });

      // Build search query
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { "pm no": { $regex: search, $options: "i" } },
          { "enrollment no": { $regex: search, $options: "i" } },
        ];
      }

      console.log("Search query:", query);

      // Use the users_data collection
      const UsersData = mongoose.model("users_data", Contact.schema);

      // Get total count
      const total = await UsersData.countDocuments(query);
      console.log("Total contacts:", total);

      // Calculate skip for pagination
      const skip = (page - 1) * limit;
      console.log("Skip:", skip, "Limit:", limit);

      // Get paginated contacts
      const contacts = await UsersData.find(query)
        .sort({ "sl no": 1 }) // Sort by serial number
        .skip(skip)
        .limit(limit)
        .lean();

      console.log("Found contacts:", contacts.length);

      // Get all users for mapping assignments
      const users = await User.find({}, "name email").lean();
      console.log("Found users for mapping:", users.length);

      // Map contacts with user assignments and ensure all fields exist
      const mappedContacts = contacts.map((contact) => {
        const assignedUser = contact.assignedTo
          ? users.find(
              (u) => u._id.toString() === contact.assignedTo.toString()
            )
          : null;

        // Ensure all phone numbers exist (even if null)
        const phoneNumbers = [
          "phone no 1",
          "phone no 2",
          "phone no 3",
          "phone no 4",
        ];
        phoneNumbers.forEach((key) => {
          if (!(key in contact)) {
            contact[key] = null;
          }
        });

        return {
          ...contact,
          assignedToName: assignedUser?.name || null,
          phoneStatuses: contact.phoneStatuses || [],
          isAssigned: !!contact.assignedTo,
        };
      });

      console.log("Mapped contacts:", mappedContacts.length);

      // Return formatted response
      res.json({
        users: mappedContacts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error in getContacts:", error);
      res.status(500).json({
        message: error.message || "Failed to fetch contacts",
        error: process.env.NODE_ENV === "development" ? error : undefined,
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
      const UsersData = mongoose.model("users_data", Contact.schema);
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
          lastCalled: null,
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
      console.error("Error in togglePhoneCalled:", error);
      res.status(500).json({
        message: error.message || "Failed to toggle phone status",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },

  // Get statistics
  getStatistics: async (req, res) => {
    try {
      const userId = req.user._id;
      const UsersData = mongoose.model("users_data", Contact.schema);

      // Get assigned contacts count
      const assignedContacts = await UsersData.countDocuments({
        assignedTo: userId,
        isAssigned: true,
      });

      // Get total calls made and unique contacts called
      const contacts = await UsersData.find({
        assignedTo: userId,
        isAssigned: true,
        "phoneStatuses.called": true,
      });

      let totalCallsMade = 0;
      const uniqueContactsSet = new Set();

      contacts.forEach((contact) => {
        const calledNumbers = contact.phoneStatuses.filter(
          (status) =>
            status.called && status.calledBy.toString() === userId.toString()
        );
        totalCallsMade += calledNumbers.length;
        if (calledNumbers.length > 0) {
          uniqueContactsSet.add(contact._id.toString());
        }
      });

      res.json({
        assignedContacts,
        totalCallsMade,
        uniqueContactsCalled: uniqueContactsSet.size,
      });
    } catch (error) {
      console.error("Error in getStatistics:", error);
      res.status(500).json({
        message: error.message || "Failed to fetch statistics",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },

  // Get assigned contacts
  getAssignedContacts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const search = req.query.search || '';
      const userId = req.user.userId;
      const userRole = req.user.role;

      console.log('Fetching assigned contacts:');
      console.log('User Role:', userRole);
      console.log('User ID:', userId);

      const UsersData = mongoose.model('users_data', Contact.schema);
      const Auth = mongoose.model('Auth');
      
      // First get the user to check their assigned contacts
      const user = await Auth.findById(userId).select('assignedContacts');
      console.log('User assigned contacts:', user?.assignedContacts?.length || 0);
      
      // Build search query
      const searchQuery = search
        ? {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { 'pm no': { $regex: search, $options: 'i' } },
              { 'enrollment no': { $regex: search, $options: 'i' } },
              { 'phone no 1': { $regex: search, $options: 'i' } },
              { 'phone no 2': { $regex: search, $options: 'i' } },
              { 'phone no 3': { $regex: search, $options: 'i' } },
              { 'phone no 4': { $regex: search, $options: 'i' } },
            ]
          }
        : {};

      // Build role-based query
      let roleQuery = {};
      if (userRole === 'user') {
        roleQuery = { 
          _id: { $in: user?.assignedContacts || [] },
          assignedTo: new mongoose.Types.ObjectId(userId)
        };
      }

      const query = {
        ...searchQuery,
        ...roleQuery
      };

      console.log('Final Query:', JSON.stringify(query, null, 2));

      // Get total count for pagination
      const total = await UsersData.countDocuments(query);
      console.log('Total matching contacts:', total);

      // Calculate skip based on page and limit
      const skip = (page - 1) * limit;

      // Get paginated contacts with full details
      const contacts = await UsersData
        .find(query)
        .sort({ 'sl no': 1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .lean();

      console.log('Found contacts for this page:', contacts.length);

      // Process each contact to ensure all fields are present
      const processedContacts = contacts.map(contact => {
        // Ensure all required fields exist with fallback values
        const processedContact = {
          _id: contact._id,
          name: contact.name || 'Not Available',
          'pm no': contact['pm no'] || 'Not Available',
          'enrollment no': contact['enrollment no'] || 'Not Available',
          'phone no 1': contact['phone no 1'] || null,
          'phone no 2': contact['phone no 2'] || null,
          'phone no 3': contact['phone no 3'] || null,
          'phone no 4': contact['phone no 4'] || null,
          address: contact.address || 'Not Available',
          assignedTo: contact.assignedTo || null,
          'sl no': contact['sl no'] || null,
          phoneStatuses: []
        };

        // Process phone statuses
        const phoneKeys = ['phone no 1', 'phone no 2', 'phone no 3', 'phone no 4'];
        const existingStatuses = contact.phoneStatuses || [];

        processedContact.phoneStatuses = phoneKeys
          .filter(key => contact[key])
          .map(key => {
            const existingStatus = existingStatuses.find(
              status => status.number === contact[key]
            );

            return {
              number: contact[key],
              called: existingStatus?.called || false,
              lastUpdated: existingStatus?.lastUpdated || null,
              _id: existingStatus?._id || new mongoose.Types.ObjectId()
            };
          });

        return processedContact;
      });

      res.json({
        contacts: processedContacts,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
          pageSize: limit
        }
      });

    } catch (error) {
      console.error('Error in getAssignedContacts:', error);
      res.status(500).json({
        message: 'Failed to fetch assigned contacts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Assign contacts
  assignContacts: async (req, res) => {
    try {
      const { contactIds, userId } = req.body;

      if (!contactIds || !userId) {
        return res
          .status(400)
          .json({ message: "Contact IDs and User ID are required" });
      }

      // Convert userId to ObjectId
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Validate user exists in Auth model
      const Auth = mongoose.model("Auth");
      const user = await Auth.findById(userObjectId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const UsersData = mongoose.model("users_data", Contact.schema);

      // Convert contactIds to ObjectIds
      const contactObjectIds = contactIds.map(id => new mongoose.Types.ObjectId(id));

      // First, unassign these contacts from any previous assignments
      await UsersData.updateMany(
        { _id: { $in: contactObjectIds } },
        {
          $unset: { assignedTo: "", assignedAt: "" },
          $set: { isAssigned: false },
        }
      );

      // Then assign them to the new user
      const result = await UsersData.updateMany(
        { _id: { $in: contactObjectIds } },
        {
          $set: {
            assignedTo: userObjectId,
            isAssigned: true,
            assignedAt: new Date(),
          },
        }
      );

      // Update the user's assignedContacts array
      await Auth.findByIdAndUpdate(userObjectId, {
        $addToSet: { assignedContacts: { $each: contactObjectIds } },
        "stats.lastAssignment": new Date(),
      });

      // Get the updated contacts to verify the assignment
      const updatedContacts = await UsersData.find({
        _id: { $in: contactObjectIds },
      });
      
      const successfullyAssigned = updatedContacts.filter(
        (contact) =>
          contact.assignedTo && contact.assignedTo.toString() === userId
      );

      if (successfullyAssigned.length === 0) {
        return res.status(400).json({
          message: "Failed to assign contacts. Please try again.",
        });
      }

      res.json({
        message: "Contacts assigned successfully",
        assigned: successfullyAssigned.length,
        total: contactIds.length,
      });
    } catch (error) {
      console.error("Error in assignContacts:", error);
      res.status(500).json({
        message: error.message || "Failed to assign contacts",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },

  // Unassign contacts
  unassignContacts: async (req, res) => {
    try {
      const { contactIds } = req.body;

      if (!contactIds || !Array.isArray(contactIds)) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }

      const UsersData = mongoose.model("users_data", Contact.schema);
      const Auth = mongoose.model("Auth");

      // Convert contactIds to ObjectIds
      const contactObjectIds = contactIds.map(id => new mongoose.Types.ObjectId(id));

      // First, find which users have these contacts assigned
      const contacts = await UsersData.find(
        { _id: { $in: contactObjectIds } },
        { assignedTo: 1 }
      ).lean();

      // Get unique user IDs who had these contacts assigned
      const affectedUserIds = [...new Set(
        contacts
          .map(contact => contact.assignedTo)
          .filter(id => id) // Remove null/undefined
      )];

      // Remove these contacts from the assignedContacts arrays of affected users
      if (affectedUserIds.length > 0) {
        await Auth.updateMany(
          { _id: { $in: affectedUserIds } },
          { $pullAll: { assignedContacts: contactObjectIds } }
        );
      }

      // Then unassign the contacts
      await UsersData.updateMany(
        { _id: { $in: contactObjectIds } },
        {
          $unset: { assignedTo: "", assignedAt: "" },
          $set: { isAssigned: false },
        }
      );

      res.json({ 
        message: "Contacts unassigned successfully",
        unassignedCount: contactIds.length,
        affectedUsers: affectedUserIds.length
      });
    } catch (error) {
      console.error("Error in unassignContacts:", error);
      res.status(500).json({
        message: error.message || "Failed to unassign contacts",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },

  // Get all users
  getUsers: async (req, res) => {
    try {
      const Auth = mongoose.model("Auth");
      const users = await Auth.find({ role: { $in: ["user", "admin"] } })
        .select("_id name email role")
        .sort({ name: 1 })
        .lean();

      res.json(users);
    } catch (error) {
      console.error("Error in getUsers:", error);
      res.status(500).json({
        message: error.message || "Failed to fetch users",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },
};

module.exports = userController;
