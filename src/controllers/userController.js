const User = require("../models/User");
const mongoose = require("mongoose");

// Get contacts with pagination
exports.getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";

    let query = {};

    // Add search condition if search term exists
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "pm no": { $regex: search, $options: "i" } },
        { "enrollment no": { $regex: search, $options: "i" } },
        { "phone no 1": { $regex: search, $options: "i" } },
        { "phone no 2": { $regex: search, $options: "i" } },
        { "phone no 3": { $regex: search, $options: "i" } },
        { "phone no 4": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    // Use the users_data collection
    const UsersData = mongoose.model('users_data', User.schema);

    // First get the total count
    const total = await UsersData.countDocuments(query);

    // Then get the paginated results
    const users = await UsersData.find(query)
      .sort({ "sl no": 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Transform the data to match the expected format
    const transformedUsers = users.map((user) => ({
      _id: user._id,
      "sl no": user["sl no"],
      "pm no": user["pm no"],
      "enrollment no": user["enrollment no"],
      name: user.name,
      "phone no 1": user["phone no 1"],
      "phone no 2": user["phone no 2"],
      "phone no 3": user["phone no 3"],
      "phone no 4": user["phone no 4"],
      address: user.address,
      assignedTo: user.assignedTo,
      assignedAt: user.assignedAt,
      isAssigned: user.isAssigned,
      phoneStatuses: user.phoneStatuses || [],
    }));

    res.json({
      users: transformedUsers,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({ message: "Failed to fetch contacts" });
  }
};

// Toggle called status
exports.togglePhoneCalled = async (req, res) => {
  try {
    const user = await User.findById(req.params.id, { collection: 'users_data' });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the contact is assigned to the current user
    if (
      req.user.role !== "admin" &&
      (!user.assignedTo || user.assignedTo.toString() !== req.user.userId)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this contact" });
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
        calledAt: null,
      };
      user.phoneStatuses.push(phoneStatus);
    }

    phoneStatus.called = !phoneStatus.called;
    if (phoneStatus.called) {
      phoneStatus.calledBy = req.user.userId;
      phoneStatus.calledAt = new Date();
    } else {
      phoneStatus.calledBy = null;
      phoneStatus.calledAt = null;
    }

    await user.save({ collection: 'users_data' });

    const transformedUser = {
      _id: user._id,
      slNo: user["sl no"],
      pmNo: user["pm no"],
      enrollmentNo: user["enrollment no"],
      name: user.name,
      phoneNumbers: [
        { type: "Phone 1", number: user["phone no 1"] },
        { type: "Phone 2", number: user["phone no 2"] },
        { type: "Phone 3", number: user["phone no 3"] },
        { type: "Phone 4", number: user["phone no 4"] },
      ].filter((phone) => phone.number),
      address: user.address || "",
      phoneStatuses: user.phoneStatuses,
      assignedTo: user.assignedTo,
      assignedAt: user.assignedAt,
      isAssigned: user.isAssigned,
    };

    res.json(transformedUser);
  } catch (error) {
    console.error("Error updating call status:", error);
    res.status(500).json({ message: "Failed to update call status" });
  }
};

// Get user statistics
exports.getUserStatistics = async (userId) => {
  try {
    const assignedContacts = await User.countDocuments({ assignedTo: userId });

    const callStats = await User.aggregate([
      {
        $match: {
          "phoneStatuses.calledBy": mongoose.Types.ObjectId(userId),
        },
      },
      {
        $project: {
          phoneStatuses: {
            $filter: {
              input: "$phoneStatuses",
              as: "status",
              cond: {
                $and: [
                  { $eq: ["$$status.called", true] },
                  {
                    $eq: ["$$status.calledBy", mongoose.Types.ObjectId(userId)],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: { $size: "$phoneStatuses" } },
          uniqueContacts: { $addToSet: "$_id" },
        },
      },
    ]);

    return {
      assignedContacts,
      totalCalls: callStats[0]?.totalCalls || 0,
      uniqueContactsCalled: callStats[0]?.uniqueContacts?.length || 0,
    };
  } catch (error) {
    console.error("Error getting user statistics:", error);
    throw error;
  }
};

// Get statistics
exports.getStatistics = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get assigned contacts count
    const assignedContacts = await User.countDocuments({
      assignedTo: userId,
      isAssigned: true,
    });

    // Get total calls made and unique contacts called
    const contacts = await User.find({
      assignedTo: userId,
      isAssigned: true,
      "phoneStatuses.called": true,
    });

    let totalCallsMade = 0;
    const uniqueContactsSet = new Set();

    contacts.forEach((contact) => {
      const calledNumbers = contact.phoneStatuses.filter(
        (status) => status.called
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
    console.error("Get statistics error:", error);
    res.status(500).json({ message: "Failed to fetch statistics" });
  }
};

// Assign contacts
exports.assignContacts = async (req, res) => {
  try {
    const { contactIds, userId } = req.body;

    if (!contactIds || !userId) {
      return res.status(400).json({ message: "Contact IDs and User ID are required" });
    }

    // Update the auth user's assignedContacts field
    const authUser = await mongoose.model('auth').findByIdAndUpdate(
      userId,
      { 
        $addToSet: { assignedContacts: { $each: contactIds } }
      },
      { new: true }
    );

    if (!authUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update the assigned status in users_data collection
    const UsersData = mongoose.model('users_data', User.schema);
    await UsersData.updateMany(
      { _id: { $in: contactIds } },
      { 
        $set: { 
          assignedTo: userId,
          assignedAt: new Date(),
          isAssigned: true
        } 
      }
    );

    res.json({ 
      message: "Users data assigned successfully",
      assignedContacts: authUser.assignedContacts 
    });
  } catch (error) {
    console.error("Assign contacts error:", error);
    res.status(500).json({ message: "Failed to assign contacts" });
  }
};

// Get assigned contacts for a user
exports.getAssignedContacts = async (req, res) => {
  try {
    const userId = req.params.id;

    // Get the auth user to get their assigned contact IDs
    const authUser = await mongoose.model('auth').findById(userId);
    if (!authUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the assigned contacts from users_data collection
    const UsersData = mongoose.model('users_data', User.schema);
    const contacts = await UsersData.find({
      _id: { $in: authUser.assignedContacts }
    }).lean();

    res.json({
      contacts,
      total: contacts.length
    });
  } catch (error) {
    console.error("Error getting assigned contacts:", error);
    res.status(500).json({ message: "Failed to fetch assigned contacts" });
  }
};

// Unassign contacts
exports.unassignContacts = async (req, res) => {
  try {
    const { contactIds } = req.body;

    if (!contactIds || !Array.isArray(contactIds)) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Remove assignment from all selected contacts
    await User.updateMany(
      { _id: { $in: contactIds } },
      {
        $unset: {
          assignedTo: "",
          assignedAt: "",
        },
        $set: {
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

// Get assigned contacts
exports.getAssignedContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const userId = req.user._id; // Get logged in user's ID

    let query = {
      assignedTo: userId,
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "pm no": { $regex: search, $options: "i" } },
        { "enrollment no": { $regex: search, $options: "i" } },
        { "phone no 1": { $regex: search, $options: "i" } },
        { "phone no 2": { $regex: search, $options: "i" } },
        { "phone no 3": { $regex: search, $options: "i" } },
        { "phone no 4": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      User.find(query, { collection: 'users_data' }).sort({ "sl no": 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query, { collection: 'users_data' }),
    ]);

    res.json({
      contacts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Get assigned contacts error:", error);
    res.status(500).json({ message: "Failed to fetch assigned contacts" });
  }
};

// Get all application users
exports.getUsers = async (req, res) => {
  try {
    // Only get users with role 'user' or 'admin'
    const users = await User.find({ role: { $in: ["user", "admin"] } })
      .select("_id name email role")
      .sort({ name: 1 })
      .lean();

    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ message: "Failed to get users" });
  }
};
