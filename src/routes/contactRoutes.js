const express = require('express');
const router = express.Router();
const { 
  getContacts, 
  getStats, 
  toggleCalled,
  createContact
} = require('../controllers/contactController');

router.get('/contacts', getContacts);
router.get('/contacts/stats', getStats);
router.put('/contacts/:id/toggle-called', toggleCalled);
router.post('/contacts', createContact);

module.exports = router;
