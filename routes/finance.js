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

    // Auto-ensure rent bills exist for all active tenants for the current/selected cycle
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const targetMonth = month ? parseInt(month, 10) : currentMonth;
    const targetYear = year ? parseInt(year, 10) : currentYear;

    const tenantScope = getTenantScope(req);
    if (hostelId) {
      tenantScope.bed = { room: { floor: { hostelId } } };
    }
    const activeTenants = await prisma.tenant.findMany({
      where: { status: 'Active', ...tenantScope }
    });

    for (const tenant of activeTenants) {
      const existing = await prisma.rent.findFirst({
        where: { tenantId: tenant.id, month: targetMonth, year: targetYear }
      });
      if (!existing) {
        const baseAmount = (tenant.rentAmount || 0) + (tenant.maintenanceFee || 0);
        await prisma.rent.create({
          data: {
            tenantId: tenant.id,
            month: targetMonth,
            year: targetYear,
            amount: baseAmount,
            status: 'Pending'
          }
        });
      }
    }

    const where = {
      ...getRentScope(req)
    };

    if (status && status !== 'All') {
      if (status === 'Paid') {
        where.status = 'Paid';
      } else if (status === 'Pending') {
        where.status = { not: 'Paid' };
      } else {
        where.status = status;
      }
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
          payments: {
            orderBy: { date: 'desc' }
          }
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { generatedAt: 'desc' }],
        skip,
        take
      })
    ]);

    // Extract unique roomIds to fetch electricity readings and active occupants
    const roomIds = [...new Set(rents.map(r => r.tenant?.bed?.roomId).filter(Boolean))];

    // Find electricity readings for these rooms
    const electricityReadings = roomIds.length > 0
      ? await prisma.electricityReading.findMany({
          where: { roomId: { in: roomIds } },
          orderBy: { createdAt: 'desc' }
        })
      : [];

    // Find all active tenants in these rooms to count occupied beds per room
    const activeTenantsInRooms = roomIds.length > 0
      ? await prisma.tenant.findMany({
          where: {
            status: 'Active',
            bed: { roomId: { in: roomIds } }
          },
          select: {
            id: true,
            bedId: true,
            bed: { select: { roomId: true, bedNumber: true } }
          }
        })
      : [];

    const roomOccupantsCount = {};
    activeTenantsInRooms.forEach(t => {
      const rId = t.bed?.roomId;
      if (rId) {
        roomOccupantsCount[rId] = (roomOccupantsCount[rId] || 0) + 1;
      }
    });

    const enrichedRents = rents.map(rent => {
      const roomId = rent.tenant?.bed?.roomId;
      
      // Match reading for this room and cycle (month & year)
      const cycleReading = electricityReadings.find(
        er => er.roomId === roomId && er.month === rent.month && er.year === rent.year
      ) || electricityReadings.find(er => er.roomId === roomId);

      const roomBill = cycleReading ? (cycleReading.netAmount || cycleReading.billAmount || 0) : 0;
      const occupiedBeds = Math.max(1, roomOccupantsCount[roomId] || rent.tenant?.bed?.room?.capacity || 1);
      
      // Electricity share per occupied bed in this room
      const electricityShare = roomBill > 0 ? Math.round((roomBill / occupiedBeds) * 100) / 100 : 0;
      
      const rentBase = rent.tenant?.rentAmount ?? 0;
      const maintenanceFee = rent.tenant?.maintenanceFee ?? 0;
      const lateFee = rent.lateFee ?? 0;
      const calculatedTotal = rentBase + maintenanceFee + electricityShare + lateFee;

      // Dynamic payments and status determination
      const totalPaid = (rent.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
      const outstandingBalance = Math.max(0, calculatedTotal - totalPaid);

      let dynamicStatus = rent.status;
      if (totalPaid >= calculatedTotal && calculatedTotal > 0) {
        dynamicStatus = 'Paid';
      } else if (totalPaid === 0) {
        dynamicStatus = 'Pending';
      } else {
        const unpaidAmount = calculatedTotal - totalPaid;
        if (Math.abs(unpaidAmount - electricityShare) < 1 && electricityShare > 0) {
          dynamicStatus = 'Electricity Due';
        } else if (Math.abs(unpaidAmount - maintenanceFee) < 1 && maintenanceFee > 0) {
          dynamicStatus = 'Maintenance Due';
        } else if (Math.abs(unpaidAmount - (electricityShare + maintenanceFee)) < 1) {
          dynamicStatus = 'Electricity & Maint. Due';
        } else if (Math.abs(totalPaid - (electricityShare + maintenanceFee)) < 1 && rentBase > 0) {
          dynamicStatus = 'Rent Due';
        } else {
          dynamicStatus = 'Partial Due';
        }
      }

      // Dynamic itemized breakdown string (only show active non-zero components)
      const breakdownParts = [];
      if (rentBase > 0) breakdownParts.push(`Rent ₹${rentBase.toLocaleString()}`);
      if (electricityShare > 0) breakdownParts.push(`Elec ₹${electricityShare.toLocaleString()}`);
      if (maintenanceFee > 0) breakdownParts.push(`Maint ₹${maintenanceFee.toLocaleString()}`);
      if (lateFee > 0) breakdownParts.push(`Late ₹${lateFee.toLocaleString()}`);
      const dynamicBreakdown = breakdownParts.length > 0 ? breakdownParts.join(' + ') : `Rent ₹${rentBase.toLocaleString()}`;

      return {
        ...rent,
        status: dynamicStatus,
        electricityAmount: electricityShare,
        roomElectricityTotal: roomBill,
        roomOccupiedBeds: occupiedBeds,
        rentAmount: rentBase,
        maintenanceAmount: maintenanceFee,
        totalBilledAmount: calculatedTotal,
        totalPaidAmount: totalPaid,
        outstandingBalance: outstandingBalance,
        breakdownLabel: dynamicBreakdown
      };
    });

    res.json({
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take) || 1,
      rents: enrichedRents
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PAYMENTS
router.post('/payments', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const { tenantId, rentId, amount, method, referenceId, status, paidComponents } = req.body;
    if (req.user.role === 'TENANT' && req.access.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const payment = await prisma.$transaction(async (tx) => {
      let refText = referenceId || '';
      if (paidComponents) {
        const parts = [];
        if (paidComponents.rent) parts.push('Rent');
        if (paidComponents.electricity) parts.push('Electricity');
        if (paidComponents.maintenance) parts.push('Maintenance');
        const compSummary = parts.length > 0 ? `Paid: ${parts.join(', ')}` : 'Partial Payment';
        refText = refText ? `${refText} [${compSummary}]` : compSummary;
      }

      const p = await tx.payment.create({
        data: {
          tenantId,
          rentId: rentId || null,
          amount: parseFloat(amount),
          method: method || 'UPI',
          referenceId: refText || null
        }
      });

      if (rentId) {
        let targetStatus = status || 'Paid';
        if (!status && paidComponents) {
          const unpaid = [];
          if (!paidComponents.rent) unpaid.push('Rent');
          if (!paidComponents.electricity) unpaid.push('Electricity');
          if (!paidComponents.maintenance) unpaid.push('Maintenance');

          if (unpaid.length === 0) {
            targetStatus = 'Paid';
          } else if (unpaid.length === 1) {
            targetStatus = `${unpaid[0]} Due`;
          } else if (unpaid.includes('Electricity') && unpaid.includes('Maintenance') && !unpaid.includes('Rent')) {
            targetStatus = 'Electricity & Maint. Due';
          } else if (unpaid.includes('Rent') && unpaid.includes('Electricity')) {
            targetStatus = 'Rent & Electricity Due';
          } else {
            targetStatus = 'Partial Due';
          }
        }

        await tx.rent.updateMany({
          where: { id: rentId, ...getRentScope(req) },
          data: { status: targetStatus }
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
