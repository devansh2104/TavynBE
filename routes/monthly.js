const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
router.post('/close', protect, authorize('HOSTEL_ADMIN'), async (req, res) => res.status(201).json({ message: 'Month closed successfully' }));
module.exports = router;
