const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const { getIO } = require('../utils/socket');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { room: { floor: { hostelId: { in: req.access.hostelIds } } } };

router.post('/readings', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { roomId, month, year, previousReading, currentReading, unitsConsumed, ratePerUnit, billAmount, netAmount } = req.body;
    const rate = ratePerUnit !== undefined ? parseFloat(ratePerUnit) : 8.0;
    const prev = parseFloat(previousReading);
    const curr = parseFloat(currentReading);
    const units = unitsConsumed !== undefined ? parseFloat(unitsConsumed) : Math.max(0, curr - prev);
    const bill = billAmount !== undefined ? parseFloat(billAmount) : units * rate;
    const net = netAmount !== undefined ? parseFloat(netAmount) : bill;

    const reading = await prisma.electricityReading.create({
      data: {
        roomId,
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        previousReading: prev,
        currentReading: curr,
        unitsConsumed: units,
        ratePerUnit: rate,
        billAmount: bill,
        netAmount: net
      }
    });

    try {
      getIO().emit('dashboard_update', {
        type: 'ELECTRICITY_LOGGED',
        reading,
        message: `Electricity meter logged: ${units} units (₹${net})`,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Socket emit warning:', e.message);
    }

    res.status(201).json(reading);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/readings', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const { hostelId, roomId, month, year, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where = {
      ...getScope(req)
    };

    if (hostelId) {
      where.room = {
        ...where.room,
        floor: {
          hostelId: hostelId
        }
      };
    }

    if (roomId) {
      where.roomId = roomId;
    }

    if (month) {
      where.month = parseInt(month, 10);
    }

    if (year) {
      where.year = parseInt(year, 10);
    }

    if (search) {
      where.room = {
        ...where.room,
        roomNumber: { contains: search }
      };
    }

    const [total, readings] = await Promise.all([
      prisma.electricityReading.count({ where }),
      prisma.electricityReading.findMany({
        where,
        include: {
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: {
                select: {
                  id: true,
                  name: true,
                  hostel: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);

    res.json({
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take) || 1,
      readings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/room/:roomId', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const readings = await prisma.electricityReading.findMany({
      where: { roomId: req.params.roomId, ...getScope(req) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/readings/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const updated = await prisma.electricityReading.updateMany({
      where: { id: req.params.id, ...getScope(req) },
      data: req.body
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-bills', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.status(201).json({ message: 'Electricity bills generated' });
});

module.exports = router;
