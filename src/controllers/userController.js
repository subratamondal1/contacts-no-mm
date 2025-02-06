const User = require("../models/User");
const Contact = require("../models/Contact");
const mongoose = require("mongoose");

const userController = {
  // Get contacts with pagination and search
  getContacts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const assignmentStatus = req.query.assignmentStatus || "all";
      const skip = (page - 1) * limit;

      // Build the search query
      let query = {};
      if (search) {
        query = {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { "pm no": { $regex: search, $options: "i" } },
            { "enrollment no": { $regex: search, $options: "i" } },
            { "phone no 1": { $regex: search, $options: "i" } },
            { "phone no 2": { $regex: search, $options: "i" } },
            { "phone no 3": { $regex: search, $options: "i" } },
            { "phone no 4": { $regex: search, $options: "i" } },
          ],
        };
      }

      // Add assignment status filter
      if (assignmentStatus === "assigned") {
        query.assignedTo = { $exists: true, $ne: null };
      } else if (assignmentStatus === "unassigned") {
        query.assignedTo = { $exists: false };
      }

      // Use aggregation for better performance
      const [{ contacts, totalCount }] = await Contact.aggregate([
        { $match: query },
        {
          $facet: {
            contacts: [
              { $sort: { "sl no": 1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $lookup: {
                  from: "users",
                  localField: "assignedTo",
                  foreignField: "_id",
                  as: "assignedToUser",
                },
              },
              {
                $addFields: {
                  assignedToUser: { $arrayElemAt: ["$assignedToUser", 0] },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  "pm no": 1,
                  "enrollment no": 1,
                  "phone no 1": 1,
                  "phone no 2": 1,
                  "phone no 3": 1,
                  "phone no 4": 1,
                  address: 1,
                  assignedTo: 1,
                  phoneStatuses: 1,
                  "assignedToUser.name": 1,
                  "assignedToUser.email": 1,
                },
              },
            ],
            totalCount: [{ $count: "count" }],
          },
        },
        {
          $project: {
            contacts: 1,
            totalCount: { $arrayElemAt: ["$totalCount.count", 0] },
          },
        },
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        contacts,
        pagination: {
          total: totalCount,
          totalPages,
          currentPage: page,
          limit,
        },
      });
    } catch (error) {
      console.error("Error in getContacts:", error);
      res.status(500).json({ message: "Error fetching contacts" });
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
      const search = req.query.search || "";
      const userId = req.user._id || req.user.userId; // Handle both cases

      console.log("Debug - Request info:", {
        page,
        limit,
        search,
        userId,
        user: req.user,
      });

      if (!userId) {
        console.error("No user ID found in request");
        return res.status(401).json({ message: "User ID not found" });
      }

      const UsersData = mongoose.model("users_data", Contact.schema);
      const Auth = mongoose.model("Auth");

      // First get the user to check their assigned contacts
      const user = await Auth.findById(userId).select("assignedContacts");

      console.log("Debug - User found:", {
        userId,
        hasUser: !!user,
        assignedContactsCount: user?.assignedContacts?.length || 0,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.assignedContacts) {
        console.log("Debug - No assigned contacts array");
        return res.json({
          contacts: [],
          pagination: {
            total: 0,
            page,
            totalPages: 0,
            hasMore: false,
            pageSize: limit,
          },
        });
      }

      // Get active contact IDs from user's assigned contacts
      const activeContactIds = (user.assignedContacts || [])
        .filter((assignment) => {
          const isActive = assignment && assignment.status === "active";
          if (!isActive) {
            console.log("Debug - Inactive assignment:", assignment);
          }
          return isActive;
        })
        .map((assignment) => {
          if (!assignment.contact) {
            console.log("Debug - Invalid assignment:", assignment);
            return null;
          }
          try {
            return new mongoose.Types.ObjectId(assignment.contact);
          } catch (err) {
            console.error("Invalid contact ID:", assignment.contact);
            return null;
          }
        })
        .filter((id) => id !== null);

      console.log("Debug - Active contacts:", {
        totalAssignments: user.assignedContacts.length,
        activeCount: activeContactIds.length,
      });

      if (activeContactIds.length === 0) {
        return res.json({
          contacts: [],
          pagination: {
            total: 0,
            page,
            totalPages: 0,
            hasMore: false,
            pageSize: limit,
          },
        });
      }

      // Build search query
      const searchQuery = search
        ? {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { "pm no": { $regex: search, $options: "i" } },
              { "enrollment no": { $regex: search, $options: "i" } },
              { "phone no 1": { $regex: search, $options: "i" } },
              { "phone no 2": { $regex: search, $options: "i" } },
              { "phone no 3": { $regex: search, $options: "i" } },
              { "phone no 4": { $regex: search, $options: "i" } },
            ],
          }
        : {};

      // Build the final query
      const query = {
        _id: { $in: activeContactIds },
        ...searchQuery,
      };

      console.log("Debug - Final query:", JSON.stringify(query, null, 2));

      // Get total count for pagination
      const total = await UsersData.countDocuments(query);

      console.log("Debug - Total contacts found:", total);

      // Calculate skip based on page and limit
      const skip = (page - 1) * limit;

      // Get paginated contacts with full details
      const contacts = await UsersData.find(query)
        .sort({ "sl no": 1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .lean();

      console.log("Debug - Fetched contacts count:", contacts.length);

      // Process each contact to ensure all fields are present and add assignment data
      const processedContacts = contacts.map((contact) => {
        // Find the assignment data for this contact
        const assignment = user.assignedContacts.find(
          (a) => a.contact && a.contact.toString() === contact._id.toString()
        );

        if (!assignment) {
          console.log("Debug - No assignment found for contact:", contact._id);
        }

        // Ensure all required fields exist with fallback values
        const processedContact = {
          _id: contact._id,
          name: contact.name || "Not Available",
          "pm no": contact["pm no"] || "Not Available",
          "enrollment no": contact["enrollment no"] || "Not Available",
          "phone no 1": contact["phone no 1"] || null,
          "phone no 2": contact["phone no 2"] || null,
          "phone no 3": contact["phone no 3"] || null,
          "phone no 4": contact["phone no 4"] || null,
          address: contact.address || "Not Available",
          assignedTo: userId,
          "sl no": contact["sl no"] || null,
          assignedAt: assignment?.assignedAt || null,
          status: assignment?.status || "active",
          phoneStatuses: [],
        };

        // Process phone statuses
        const phoneKeys = [
          "phone no 1",
          "phone no 2",
          "phone no 3",
          "phone no 4",
        ];
        const existingStatuses = contact.phoneStatuses || [];

        processedContact.phoneStatuses = phoneKeys
          .filter((key) => contact[key])
          .map((key) => {
            const existingStatus = existingStatuses.find(
              (status) => status.number === contact[key]
            );

            return {
              number: contact[key],
              called: existingStatus?.called || false,
              lastUpdated: existingStatus?.lastUpdated || null,
              _id: existingStatus?._id || new mongoose.Types.ObjectId(),
            };
          });

        return processedContact;
      });

      const response = {
        contacts: processedContacts,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
          pageSize: limit,
        },
      };

      console.log("Debug - Final response:", {
        contactsCount: processedContacts.length,
        pagination: response.pagination,
      });

      res.json(response);
    } catch (error) {
      console.error("Error in getAssignedContacts:", error);
      res.status(500).json({
        message: "Failed to fetch assigned contacts",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
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
      const contactObjectIds = contactIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      // Only assign contacts that aren't already assigned
      const unassignedContacts = await UsersData.find({
        _id: { $in: contactObjectIds },
        $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }],
      });

      const unassignedContactIds = unassignedContacts.map((c) => c._id);

      if (unassignedContactIds.length === 0) {
        return res.status(400).json({
          message: "All selected contacts are already assigned to users.",
        });
      }

      // Mark contacts as assigned in the contacts collection
      const result = await UsersData.updateMany(
        { _id: { $in: unassignedContactIds } },
        {
          $set: {
            assignedTo: userObjectId,
            isAssigned: true,
            assignedAt: new Date(),
          },
        }
      );

      // Get current user's assigned contacts
      const currentUser = await Auth.findById(userObjectId);

      // Create new contact assignments
      const newAssignments = unassignedContactIds.map((contactId) => ({
        contact: contactId,
        assignedAt: new Date(),
        status: "active",
      }));

      // Add new assignments to user's assigned contacts
      const updatedAssignments = [
        ...(currentUser.assignedContacts || []),
        ...newAssignments,
      ];

      // Update user's assigned contacts and stats
      await Auth.findByIdAndUpdate(userObjectId, {
        $set: {
          assignedContacts: updatedAssignments,
          "stats.lastAssignment": new Date(),
          "stats.totalAssignedContacts": updatedAssignments.length,
          "stats.activeAssignedContacts": updatedAssignments.filter(
            (a) => a.status === "active"
          ).length,
        },
      });

      // Get the updated contacts to verify the assignment
      const updatedContactsData = await UsersData.find({
        _id: { $in: unassignedContactIds },
      });

      const successfullyAssigned = updatedContactsData.filter(
        (contact) =>
          contact.assignedTo && contact.assignedTo.toString() === userId
      );

      if (successfullyAssigned.length === 0) {
        return res.status(400).json({
          message: "Failed to assign contacts. Please try again.",
        });
      }

      // Get the final user data to confirm the total assignments
      const finalUserData = await Auth.findById(userObjectId);

      res.json({
        message: `${successfullyAssigned.length} new contacts assigned successfully. Total active contacts: ${finalUserData.stats.activeAssignedContacts}`,
        assigned: successfullyAssigned.length,
        totalActive: finalUserData.stats.activeAssignedContacts,
        totalAssigned: finalUserData.stats.totalAssignedContacts,
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
      const contactObjectIds = contactIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      // First, find which users have these contacts assigned
      const contacts = await UsersData.find(
        { _id: { $in: contactObjectIds } },
        { assignedTo: 1 }
      ).lean();

      // Get unique user IDs who had these contacts assigned
      const affectedUserIds = [
        ...new Set(
          contacts.map((contact) => contact.assignedTo).filter((id) => id) // Remove null/undefined
        ),
      ];

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
        affectedUsers: affectedUserIds.length,
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
      const users = await Auth.aggregate([
        {
          $match: {
            role: { $in: ["user", "admin"] },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            role: 1,
            assignedContacts: { $size: { $ifNull: ["$assignedContacts", []] } },
            stats: {
              totalAssigned: { $size: { $ifNull: ["$assignedContacts", []] } },
              totalCalls: { $ifNull: ["$stats.totalCallsMade", 0] },
              successfulCalls: { $ifNull: ["$stats.uniqueContactsCalled", 0] },
              pendingCalls: {
                $subtract: [
                  { $size: { $ifNull: ["$assignedContacts", []] } },
                  { $ifNull: ["$stats.uniqueContactsCalled", 0] },
                ],
              },
              lastActive: "$stats.lastActive",
              lastAssignment: "$stats.lastAssignment",
            },
            createdAt: 1,
            updatedAt: 1,
          },
        },
        {
          $sort: { name: 1 },
        },
      ]);

      res.json(users);
    } catch (error) {
      console.error("Error in getUsers:", error);
      res.status(500).json({
        message: error.message || "Error fetching users",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },

  // Get a single user's data from users_data collection
  getUserDataById: async (req, res) => {
    try {
      const userId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const UsersData = mongoose.model("users_data", Contact.schema);
      const userData = await UsersData.findById(userId)
        .populate('assignedTo', 'name email')
        .lean();

      if (!userData) {
        return res.status(404).json({ message: "User data not found" });
      }

      res.json(userData);
    } catch (error) {
      console.error("Error in getUserDataById:", error);
      res.status(500).json({ message: "Error fetching user data" });
    }
  },
};

module.exports = userController;
