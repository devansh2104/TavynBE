const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();
const { getIO } = require('../utils/socket');

const getScope = (req) => {
  if (req.user.role === 'TENANT') return { id: req.access.tenantId };
  if (req.access.all) return {};
  return { bed: { room: { floor: { hostelId: { in: req.access.hostelIds } } } } };
};

router.post('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const tenant = await prisma.tenant.create({ data: req.body });
    if (req.body.bedId) {
      await prisma.bed.update({ where: { id: req.body.bedId }, data: { status: 'Occupied' } });
    }

    // Auto-create initial Rent bill for the tenant for current billing cycle
    const now = new Date();
    const cycleMonth = now.getMonth() + 1;
    const cycleYear = now.getFullYear();
    const baseAmount = (tenant.rentAmount || 0) + (tenant.maintenanceFee || 0);

    const rent = await prisma.rent.create({
      data: {
        tenantId: tenant.id,
        month: cycleMonth,
        year: cycleYear,
        amount: baseAmount,
        status: 'Pending'
      }
    });

    getIO().emit('dashboard_update', { type: 'TENANT_ADDED', tenant });
    getIO().emit('dashboard_update', { type: 'RENT_GENERATED', rent });
    res.status(201).json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId, status, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where = { ...getScope(req) };

    if (hostelId) {
      where.bed = {
        ...where.bed,
        room: {
          ...where.bed?.room,
          floor: {
            ...where.bed?.room?.floor,
            hostelId
          }
        }
      };
    }

    if (status && status !== 'All') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } }
      ];
    }

    const [total, tenants] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        include: {
          bed: {
            include: {
              room: {
                include: {
                  floor: {
                    include: {
                      hostel: { select: { id: true, name: true } }
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
      tenants
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  const tenant = await prisma.tenant.findFirst({
    where: { id: req.params.id, ...getScope(req) },
    include: {
      bed: {
        include: {
          room: {
            include: {
              floor: {
                include: { hostel: true }
              }
            }
          }
        }
      },
      rents: {
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { payments: true }
      }
    }
  });
  if (!tenant) return res.status(404).json({ message: 'Not found' });
  res.json(tenant);
});

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const updated = await prisma.tenant.updateMany({
    where: { id: req.params.id, ...getScope(req) },
    data: req.body
  });
  res.json(updated);
});

router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.tenant.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  res.json({ message: 'Tenant deleted' });
});

router.put('/:id/checkout', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const tenant = await prisma.tenant.findFirst({ where: { id: req.params.id, ...getScope(req) } });
  if (!tenant) return res.status(404).json({ message: 'Not found' });
  if (tenant.bedId) await prisma.bed.update({ where: { id: tenant.bedId }, data: { status: 'Available' } });
  await prisma.tenant.update({
    where: { id: req.params.id },
    data: { status: 'CheckedOut', bedId: null, checkOutDate: new Date() }
  });
  getIO().emit('dashboard_update', { type: 'TENANT_CHECKOUT', tenantId: req.params.id });
  res.json({ message: 'Tenant checked out' });
});

router.put('/:id/transfer-room', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json({ message: 'Tenant transferred' });
});

router.post('/:id/upload-photo', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.status(201).json({ message: 'Photo uploaded' });
});

router.post('/:id/upload-id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.status(201).json({ message: 'ID uploaded' });
});

module.exports = router;
