const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const { getIO } = require('../utils/socket');

const getScope = (req) => req.access.all ? {} : { room: { floor: { hostelId: { in: req.access.hostelIds } } } };

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const result = await prisma.bed.updateMany({ where: { id: req.params.id, ...getScope(req) }, data: req.body });
  try {
    getIO().emit('dashboard_update', {
      type: 'BED_UPDATED',
      bedId: req.params.id,
      message: 'Bed status updated',
      timestamp: new Date().toISOString()
    });
  } catch (e) {}
  res.json(result);
});

router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.bed.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  try {
    getIO().emit('dashboard_update', {
      type: 'BED_DELETED',
      bedId: req.params.id,
      message: 'Bed allocation removed',
      timestamp: new Date().toISOString()
    });
  } catch (e) {}
  res.json({ message: 'Bed deleted' });
});
module.exports = router;
