const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();
const { getIO } = require('../utils/socket');

const getTenantScope = (req) => {
  if (req.user.role === 'TENANT') return { id: req.access.tenantId };
  if (req.access.all) return {};
  return { bed: { room: { floor: { hostelId: { in: req.access.hostelIds } } } } };
};

const getRentScope = (req) => {
  if (req.user.role === 'TENANT') return { tenantId: req.access.tenantId };
  if (req.access.all) return {};
  return { tenant: { bed: { room: { floor: { hostelId: { in: req.access.hostelIds } } } } } };
};

const getExpenseScope = (req) => {
  if (req.access.all) return {};
  return { hostelId: { in: req.access.hostelIds } };
};

// RENT
router.post('/rent/generate-monthly', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { month, year, hostelId } = req.body;
    const scope = getTenantScope(req);
    if (hostelId) {
      scope.bed = { room: { floor: { hostelId } } };
    }

    const activeTenants = await prisma.tenant.findMany({
      where: { status: 'Active', ...scope },
      include: { bed: { include: { room: true } } }
    });

    let generatedCount = 0;
    for (const tenant of activeTenants) {
      const existing = await prisma.rent.findFirst({
        where: { tenantId: tenant.id, month: parseInt(month, 10), year: parseInt(year, 10) }
      });
      if (!existing) {
        // Base amount: Rent + Maintenance fee
        const baseAmount = (tenant.rentAmount || 0) + (tenant.maintenanceFee || 0);
        await prisma.rent.create({
          data: {
            tenantId: tenant.id,
            month: parseInt(month, 10),
            year: parseInt(year, 10),
            amount: baseAmount
          }
        });
        generatedCount++;
      }
    }

    try {
      getIO().emit('dashboard_update', {
        type: 'RENT_GENERATED',
        count: generatedCount,
        month,
        year,
        message: `Auto-generated ${generatedCount} rent bills for cycle ${month}/${year}`,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Socket emit warning:', e.message);
    }

    res.status(201).json({ message: `Successfully generated ${generatedCount} rent records.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rent', protect, async (req, res) => {
  try {
    const { status, month, year, hostelId, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where = {
      ...getRentScope(req)
    };

    if (status && status !== 'All') {
      where.status = status;
    }

    if (month) {
      where.month = parseInt(month, 10);
    }

    if (year) {
      where.year = parseInt(year, 10);
    }

    if (hostelId) {
      where.tenant = {
        ...where.tenant,
        bed: {
          ...where.tenant?.bed,
          room: {
            ...where.tenant?.bed?.room,
            floor: {
              ...where.tenant?.bed?.room?.floor,
              hostelId
            }
          }
        }
      };
    }

    if (search) {
      where.tenant = {
        ...where.tenant,
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } }
        ]
      };
    }

    const [total, rents] = await Promise.all([
      prisma.rent.count({ where }),
      prisma.rent.findMany({
        where,
        include: {
          tenant: {
            include: {
              bed: {
                include: {
                  room: {
                    include: {
                      floor: {
                        include: {
                          hostel: {
                            select: { id: true, name: true }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          payments: true
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { generatedAt: 'desc' }],
        skip,
        take
      })
    ]);

    res.json({
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take) || 1,
      rents
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PAYMENTS
router.post('/payments', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const { tenantId, rentId, amount, method, referenceId } = req.body;
    if (req.user.role === 'TENANT' && req.access.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          tenantId,
          rentId,
          amount: parseFloat(amount),
          method: method || 'UPI',
          referenceId
        }
      });
      if (rentId) {
        await tx.rent.updateMany({
          where: { id: rentId, ...getRentScope(req) },
          data: { status: 'Paid' }
        });
      }
      return p;
    });
    getIO().emit('dashboard_update', { type: 'PAYMENT_RECEIVED', payment });
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// EXPENSES (Building and Room Specific)
router.post('/expenses', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId, roomId, category, amount, description, date } = req.body;
    if (!req.access.all && !req.access.hostelIds.includes(hostelId)) {
      return res.status(403).json({ message: 'Unauthorized for this hostel' });
    }

    const expense = await prisma.expense.create({
      data: {
        hostelId,
        roomId: roomId || null,
        category,
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date()
      },
      include: {
        room: true,
        hostel: { select: { id: true, name: true } }
      }
    });
    getIO().emit('dashboard_update', { type: 'EXPENSE_ADDED', expense });
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/expenses', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId, roomId, category, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where = {
      ...getExpenseScope(req)
    };

    if (hostelId) {
      where.hostelId = hostelId;
    }

    if (roomId) {
      where.roomId = roomId;
    }

    if (category && category !== 'All') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { description: { contains: search } },
        { category: { contains: search } }
      ];
    }

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: {
          hostel: { select: { id: true, name: true } },
          room: { select: { id: true, roomNumber: true } }
        },
        orderBy: { date: 'desc' },
        skip,
        take
      })
    ]);

    res.json({
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take) || 1,
      expenses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
