const Auth = require('../models/Auth');

const createAdminUser = async () => {
  try {
    // Check if admin exists
    const admin = await Auth.findOne({ email: 'admin@gmail.com' });
    
    if (!admin) {
      // Create new admin user
      const newAdmin = new Auth({
        email: 'admin@gmail.com',
        password: 'admin@123', // In production, use hashed password
        role: 'admin',
        name: 'Admin'
      });
      
      await newAdmin.save();
      console.log('Admin user created successfully');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
};

module.exports = { createAdminUser };
