const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { hostelId: { in: req.access.hostelIds } };

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const floor = await prisma.floor.updateMany({ where: { id: req.params.id, ...getScope(req) }, data: req.body });
  res.json(floor);
});
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.floor.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  res.json({ message: 'Floor deleted' });
});
module.exports = router;
