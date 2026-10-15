const express = require('express');
const { protect } = require('../middlewares/auth');
const router = express.Router();
router.get('/:paymentId', protect, async (req, res) => res.json({ message: 'Receipt info' }));
router.get('/download/:paymentId', protect, async (req, res) => res.json({ message: 'PDF binary stream' }));
module.exports = router;
