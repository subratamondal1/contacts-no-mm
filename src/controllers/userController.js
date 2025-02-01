const User = require('../models/User');

// Get users with pagination
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const query = search
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

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ 'sl no': 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      users: users.map(user => ({
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
        phoneStatuses: user.phoneStatuses || []
      })),
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
      phoneStatuses: user.phoneStatuses || []
    };

    res.json(transformedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle called status
exports.togglePhoneCalled = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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
      phoneStatus = { number: phoneNumber, called: false };
      user.phoneStatuses.push(phoneStatus);
    }

    phoneStatus.called = !phoneStatus.called;
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
      phoneStatuses: user.phoneStatuses
    };

    res.json(transformedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get statistics
exports.getStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $project: {
          phoneCount: {
            $size: {
              $filter: {
                input: [
                  '$phone no 1',
                  '$phone no 2',
                  '$phone no 3',
                  '$phone no 4'
                ],
                as: 'phone',
                cond: { $ne: ['$$phone', null] }
              }
            }
          },
          calledCount: {
            $size: { $ifNull: ['$phoneStatuses', []] }
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$phoneCount' },
          called: { $sum: '$calledCount' }
        }
      }
    ]);

    const { total = 0, called = 0 } = stats[0] || {};
    res.json({ total, called });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
