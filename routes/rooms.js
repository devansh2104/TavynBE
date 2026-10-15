const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { floor: { hostelId: { in: req.access.hostelIds } } };

router.post('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const room = await prisma.room.create({ data: req.body });
  res.status(201).json(room);
});

router.get('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId, search } = req.query;
    const where = { ...getScope(req) };

    if (hostelId) {
      where.floor = {
        ...where.floor,
        hostelId
      };
    }

    if (search) {
      where.roomNumber = { contains: search };
    }

    const rooms = await prisma.room.findMany({
      where,
      include: {
        floor: {
          select: {
            id: true,
            name: true,
            hostelId: true,
            hostel: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        beds: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                rentAmount: true,
                checkInDate: true
              }
            }
          }
        }
      },
      orderBy: { roomNumber: 'asc' }
    });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const room = await prisma.room.findFirst({
      where: { id: req.params.id, ...getScope(req) },
      include: {
        floor: {
          include: { hostel: true }
        },
        beds: {
          include: {
            tenant: true
          }
        }
      }
    });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Comprehensive Room History Route: occupants history, meter logs, room expenses
router.get('/:id/history', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const roomId = req.params.id;
    const room = await prisma.room.findFirst({
      where: { id: roomId, ...getScope(req) },
      include: {
        floor: {
          include: { hostel: true }
        },
        beds: {
          include: {
            tenant: true
          }
        }
      }
    });

    if (!room) return res.status(404).json({ message: 'Room not found' });

    // 1. Current & past tenants linked to beds in this room
    const tenants = await prisma.tenant.findMany({
      where: {
        bed: {
          roomId: roomId
        }
      },
      orderBy: { checkInDate: 'desc' }
    });

    // 2. Electricity meter history for this room
    const electricityReadings = await prisma.electricityReading.findMany({
      where: { roomId: roomId },
      orderBy: { createdAt: 'desc' }
    });

    // 3. Room-specific expenses (repairs, maintenance)
    const expenses = await prisma.expense.findMany({
      where: { roomId: roomId },
      orderBy: { date: 'desc' }
    });

    res.json({
      room,
      tenants,
      electricityReadings,
      expenses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const updated = await prisma.room.updateMany({
    where: { id: req.params.id, ...getScope(req) },
    data: req.body
  });
  res.json(updated);
});

router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.room.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  res.json({ message: 'Room deleted' });
});

router.get('/:id/occupancy', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json({ occupancy: '75%' });
});

router.post('/:roomId/beds', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const bed = await prisma.bed.create({
    data: { bedNumber: req.body.bedNumber, roomId: req.params.roomId }
  });
  res.status(201).json(bed);
});

router.get('/:roomId/beds', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json(await prisma.bed.findMany({
    where: { roomId: req.params.roomId, room: getScope(req) },
    include: { tenant: true }
  }));
});

module.exports = router;
