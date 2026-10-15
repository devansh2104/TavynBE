const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/overview', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId } = req.query;
    
    // Determine target hostels
    let targetHostelIds = [];
    if (hostelId) {
      if (!req.access.all && !req.access.hostelIds.includes(hostelId)) {
        return res.status(403).json({ message: 'Unauthorized for this hostel' });
      }
      targetHostelIds = [hostelId];
    } else {
      targetHostelIds = req.access.all 
        ? (await prisma.hostel.findMany({ select: { id: true } })).map(h => h.id)
        : req.access.hostelIds;
    }

    const hostelFilter = { in: targetHostelIds };

    const totalTenants = await prisma.tenant.count({
      where: {
        status: 'Active',
        bed: { room: { floor: { hostelId: hostelFilter } } }
      }
    });

    const totalBeds = await prisma.bed.count({
      where: { room: { floor: { hostelId: hostelFilter } } }
    });

    const occupiedBeds = await prisma.bed.count({
      where: { status: 'Occupied', room: { floor: { hostelId: hostelFilter } } }
    });

    const occupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : 0;

    // Monthly dues & collections
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentRents = await prisma.rent.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
        tenant: {
          bed: { room: { floor: { hostelId: hostelFilter } } }
        }
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            phone: true,
            bed: {
              select: {
                bedNumber: true,
                room: { select: { roomNumber: true } }
              }
            }
          }
        }
      }
    });

    const pendingRentList = currentRents.filter(r => r.status !== 'Paid');
    const pendingRentSum = pendingRentList.reduce((sum, r) => sum + (r.amount || 0), 0);
    const paidRentSum = currentRents
      .filter(r => r.status === 'Paid')
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    // Electricity
    const electricityReadings = await prisma.electricityReading.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
        room: { floor: { hostelId: hostelFilter } }
      }
    });

    const totalRoomsCount = await prisma.room.count({
      where: { floor: { hostelId: hostelFilter } }
    });

    const electricityRevenue = electricityReadings.reduce((sum, el) => sum + (el.netAmount || el.billAmount || 0), 0);
    const pendingMeterRoomsCount = Math.max(0, totalRoomsCount - electricityReadings.length);

    // Recent Payments
    const recentPayments = await prisma.payment.findMany({
      where: {
        tenant: {
          bed: { room: { floor: { hostelId: hostelFilter } } }
        }
      },
      include: {
        tenant: { select: { name: true } },
        rent: { select: { month: true, year: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Attention alerts
    const attention = [];
    if (pendingRentList.length > 0) {
      attention.push({
        id: 'pending_rent',
        type: 'critical',
        title: `${pendingRentList.length} tenant(s) have pending rent dues`,
        count: pendingRentList.length,
        amount: pendingRentSum,
        actionUrl: '/rent',
        actionLabel: 'Collect Rent'
      });
    }

    if (pendingMeterRoomsCount > 0) {
      attention.push({
        id: 'pending_meter',
        type: 'warning',
        title: `${pendingMeterRoomsCount} room(s) missing electricity meter readings for Month ${currentMonth}`,
        count: pendingMeterRoomsCount,
        actionUrl: '/electricity',
        actionLabel: 'Enter Readings'
      });
    }

    const vacantBedsCount = Math.max(0, totalBeds - occupiedBeds);
    if (vacantBedsCount > 0) {
      attention.push({
        id: 'vacant_beds',
        type: 'info',
        title: `${vacantBedsCount} vacant bed(s) ready for tenant allocation`,
        count: vacantBedsCount,
        actionUrl: '/rooms',
        actionLabel: 'View Vacancies'
      });
    }

    res.json({
      totalTenants,
      occupancyRate: `${occupancyRate}%`,
      totalBeds,
      occupiedBeds,
      vacantBeds: vacantBedsCount,
      feeDues: pendingRentSum,
      monthlyRevenue: paidRentSum + electricityRevenue,
      attention,
      recentPayments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/revenue', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ revenue: 15000 }));
router.get('/occupancy', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ occupancy: '80%' }));

module.exports = router;
