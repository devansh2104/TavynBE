const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { id: { in: req.access.hostelIds } };

router.post('/', protect, authorize('HOSTEL_ADMIN'), async (req, res) => {
  const hostel = await prisma.hostel.create({ data: { ...req.body, adminId: req.user.id } });
  res.status(201).json(hostel);
});
router.get('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json(await prisma.hostel.findMany({ where: getScope(req) }));
});
router.get('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const hostel = await prisma.hostel.findFirst({ where: { id: req.params.id, ...getScope(req) } });
  if(!hostel) return res.status(404).json({message: 'Not found'});
  res.json(hostel);
});
router.put('/:id', protect, authorize('HOSTEL_ADMIN'), async (req, res) => {
  const hostel = await prisma.hostel.updateMany({ where: { id: req.params.id, ...getScope(req) }, data: req.body });
  res.json(hostel);
});
router.delete('/:id', protect, authorize('HOSTEL_ADMIN'), async (req, res) => {
  await prisma.hostel.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  res.json({ message: 'Hostel deleted' });
});

// Floors scoped to hostel access
router.post('/:hostelId/floors', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  if (!req.access.all && !req.access.hostelIds.includes(req.params.hostelId)) return res.status(403).json({ message: 'Unauthorized' });
  const floor = await prisma.floor.create({ data: { name: req.body.name, hostelId: req.params.hostelId } });
  res.status(201).json(floor);
});
router.get('/:hostelId/floors', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  if (!req.access.all && req.user.role !== 'TENANT' && !req.access.hostelIds.includes(req.params.hostelId)) return res.status(403).json({ message: 'Unauthorized' });
  res.json(await prisma.floor.findMany({ where: { hostelId: req.params.hostelId } }));
});
module.exports = router;
