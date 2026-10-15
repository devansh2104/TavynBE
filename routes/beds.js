const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { room: { floor: { hostelId: { in: req.access.hostelIds } } } };

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.bed.updateMany({where: {id: req.params.id, ...getScope(req)}, data: req.body})));
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.bed.deleteMany({where: {id: req.params.id, ...getScope(req)}});
  res.json({ message: 'Bed deleted' });
});
module.exports = router;
