const Auth = require('../models/Auth');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await Auth.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (password !== user.password) { // In production, use proper password hashing
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create user (admin only)
exports.createUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await Auth.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new Auth({
      email,
      password, // In production, hash the password
      role: 'user',
      name
    });

    await user.save();

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users with their contact statistics (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await Auth.find({ role: 'user' })
      .select('-password')
      .lean();

    // Get statistics for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const assignedContacts = await User.countDocuments({ assignedTo: user._id });
      const calledNumbers = await User.aggregate([
        {
          $match: {
            'phoneStatuses.calledBy': user._id
          }
        },
        {
          $project: {
            calledCount: {
              $size: {
                $filter: {
                  input: '$phoneStatuses',
                  as: 'status',
                  cond: {
                    $and: [
                      { $eq: ['$$status.called', true] },
                      { $eq: ['$$status.calledBy', user._id] }
                    ]
                  }
                }
              }
            }
          }
        }
      ]);

      const totalCalls = calledNumbers.reduce((sum, doc) => sum + doc.calledCount, 0);

      return {
        ...user,
        statistics: {
          assignedContacts,
          totalCalls
        }
      };
    }));

    res.json(usersWithStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Assign contacts to user (admin only)
exports.assignContacts = async (req, res) => {
  try {
    const { userId, contactIds } = req.body;

    // Check if contacts are already assigned
    const alreadyAssigned = await User.findOne({
      _id: { $in: contactIds },
      isAssigned: true
    });

    if (alreadyAssigned) {
      return res.status(400).json({
        message: 'Some contacts are already assigned to users'
      });
    }

    // Update contacts to be assigned to this user
    await User.updateMany(
      { _id: { $in: contactIds } },
      {
        $set: {
          assignedTo: userId,
          assignedAt: new Date(),
          isAssigned: true
        }
      }
    );

    res.json({ message: 'Contacts assigned successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unassign contacts (admin only)
exports.unassignContacts = async (req, res) => {
  try {
    const { contactIds } = req.body;

    await User.updateMany(
      { _id: { $in: contactIds } },
      {
        $set: {
          assignedTo: null,
          assignedAt: null,
          isAssigned: false
        }
      }
    );

    res.json({ message: 'Contacts unassigned successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.params.userId;
    
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

    const stats = {
      assignedContacts,
      totalCalls: callStats[0]?.totalCalls || 0,
      uniqueContactsCalled: callStats[0]?.uniqueContacts?.length || 0
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get assigned contacts (for users)
exports.getAssignedContacts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const [contacts, total] = await Promise.all([
      User.find({ assignedTo: userId })
        .sort({ 'sl no': 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments({ assignedTo: userId })
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
    res.status(500).json({ message: error.message });
  }
};
