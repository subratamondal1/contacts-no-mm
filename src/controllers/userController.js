const User = require('../models/User');
const mongoose = require('mongoose');

// Get contacts with pagination
exports.getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    let query = {};

    // Add search condition if search term exists
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'pm no': { $regex: search, $options: 'i' } },
        { 'enrollment no': { $regex: search, $options: 'i' } },
        { 'phone no 1': { $regex: search, $options: 'i' } },
        { 'phone no 2': { $regex: search, $options: 'i' } },
        { 'phone no 3': { $regex: search, $options: 'i' } },
        { 'phone no 4': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    // First get the total count
    const total = await User.countDocuments(query);

    // Then get the paginated results
    const users = await User.find(query)
      .sort({ 'sl no': 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Transform the data to match the expected format
    const transformedUsers = users.map(user => ({
      _id: user._id,
      'sl no': user['sl no'],
      'pm no': user['pm no'],
      'enrollment no': user['enrollment no'],
      name: user.name,
      'phone no 1': user['phone no 1'],
      'phone no 2': user['phone no 2'],
      'phone no 3': user['phone no 3'],
      'phone no 4': user['phone no 4'],
      address: user.address,
      assignedTo: user.assignedTo,
      assignedAt: user.assignedAt,
      isAssigned: user.isAssigned,
      phoneStatuses: user.phoneStatuses || []
    }));

    res.json({
      users: transformedUsers,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
};

// Toggle called status
exports.togglePhoneCalled = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the contact is assigned to the current user
    if (req.user.role !== 'admin' && (!user.assignedTo || user.assignedTo.toString() !== req.user.userId)) {
      return res.status(403).json({ message: 'Not authorized to update this contact' });
    }

    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    let phoneStatus = user.phoneStatuses?.find(status => status.number === phoneNumber);
    if (!phoneStatus) {
      if (!user.phoneStatuses) {
        user.phoneStatuses = [];
      }
      phoneStatus = {
        number: phoneNumber,
        called: false,
        calledBy: null,
        calledAt: null
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

    await user.save();

    const transformedUser = {
      _id: user._id,
      slNo: user['sl no'],
      pmNo: user['pm no'],
      enrollmentNo: user['enrollment no'],
      name: user.name,
      phoneNumbers: [
        { type: 'Phone 1', number: user['phone no 1'] },
        { type: 'Phone 2', number: user['phone no 2'] },
        { type: 'Phone 3', number: user['phone no 3'] },
        { type: 'Phone 4', number: user['phone no 4'] }
      ].filter(phone => phone.number),
      address: user.address || '',
      phoneStatuses: user.phoneStatuses,
      assignedTo: user.assignedTo,
      assignedAt: user.assignedAt,
      isAssigned: user.isAssigned
    };

    res.json(transformedUser);
  } catch (error) {
    console.error('Error updating call status:', error);
    res.status(500).json({ message: 'Failed to update call status' });
  }
};

// Get user statistics
exports.getUserStatistics = async (userId) => {
  try {
    const assignedContacts = await User.countDocuments({ assignedTo: userId });
    
    const callStats = await User.aggregate([
      {
        $match: {
          'phoneStatuses.calledBy': mongoose.Types.ObjectId(userId)
        }
      },
      {
        $project: {
          phoneStatuses: {
            $filter: {
              input: '$phoneStatuses',
              as: 'status',
              cond: {
                $and: [
                  { $eq: ['$$status.called', true] },
                  { $eq: ['$$status.calledBy', mongoose.Types.ObjectId(userId)] }
                ]
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: { $size: '$phoneStatuses' } },
          uniqueContacts: { $addToSet: '$_id' }
        }
      }
    ]);

    return {
      assignedContacts,
      totalCalls: callStats[0]?.totalCalls || 0,
      uniqueContactsCalled: callStats[0]?.uniqueContacts?.length || 0
    };
  } catch (error) {
    console.error('Error getting user statistics:', error);
    throw error;
  }
};

// Get assigned contacts
exports.getAssignedContacts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || '';

    let query = {
      assignedTo: mongoose.Types.ObjectId(userId)
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'pm no': { $regex: search, $options: 'i' } },
        { 'enrollment no': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      User.find(query)
        .select('name pm\\ no enrollment\\ no phone\\ no\\ 1 phone\\ no\\ 2 phone\\ no\\ 3 phone\\ no\\ 4 phoneStatuses address')
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const transformedContacts = contacts.map(contact => ({
      _id: contact._id,
      name: contact.name,
      pmNo: contact['pm no'] || '',
      enrollmentNo: contact['enrollment no'] || '',
      phoneNumbers: [
        { type: 'Phone 1', number: contact['phone no 1'] },
        { type: 'Phone 2', number: contact['phone no 2'] },
        { type: 'Phone 3', number: contact['phone no 3'] },
        { type: 'Phone 4', number: contact['phone no 4'] }
      ].filter(phone => phone.number),
      phoneStatuses: contact.phoneStatuses || [],
      address: contact.address || ''
    }));

    res.json({
      contacts: transformedContacts,
      total,
      pages: Math.ceil(total / limit),
      page,
      limit
    });
  } catch (error) {
    console.error('Get assigned contacts error:', error);
    res.status(500).json({ message: 'Failed to fetch assigned contacts' });
  }
};
