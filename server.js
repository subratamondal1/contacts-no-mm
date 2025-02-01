const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Dummy contacts data
let contacts = [
  { id: 1, name: 'John Doe', phone: '+1234567890', called: false },
  { id: 2, name: 'Jane Smith', phone: '+1987654321', called: false },
  { id: 3, name: 'Alice Johnson', phone: '+1122334455', called: false },
  { id: 4, name: 'Bob Wilson', phone: '+1555666777', called: false },
];

// Get all contacts
app.get('/api/contacts', (req, res) => {
  res.json(contacts);
});

// Update contact called status
app.put('/api/contacts/:id/called', (req, res) => {
  const id = parseInt(req.params.id);
  contacts = contacts.map(contact => 
    contact.id === id ? { ...contact, called: true } : contact
  );
  res.json(contacts.find(contact => contact.id === id));
});

// Get contact statistics
app.get('/api/contacts/stats', (req, res) => {
  const total = contacts.length;
  const called = contacts.filter(contact => contact.called).length;
  res.json({ total, called });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
