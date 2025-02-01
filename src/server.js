require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB successfully');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Routes
app.get('/test', (req, res) => {
  res.json({ message: 'Server is running' });
});
app.use('/api', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: err.message });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
