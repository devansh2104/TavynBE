const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ message: 'Document deleted' }));
module.exports = router;
