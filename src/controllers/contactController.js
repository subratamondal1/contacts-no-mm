let contacts = require('../data/contacts');

// Get all contacts
exports.getContacts = async (req, res) => {
  try {
    // Sort contacts by name
    const sortedContacts = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    res.json(sortedContacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get contact statistics
exports.getStats = async (req, res) => {
  try {
    const total = contacts.length;
    const called = contacts.filter(contact => contact.called).length;
    res.json({ total, called });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle contact called status
exports.toggleCalled = async (req, res) => {
  try {
    const contact = contacts.find(c => c.id === parseInt(req.params.id));
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    
    contact.called = !contact.called;
    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new contact (for future use with database)
exports.createContact = async (req, res) => {
  try {
    const newContact = {
      id: contacts.length + 1,
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      called: false
    };
    contacts.push(newContact);
    res.status(201).json(newContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
