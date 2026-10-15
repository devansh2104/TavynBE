const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize, DEFAULT_PERMISSIONS } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

// 1. Get staff list for active hostel / admin
router.get('/', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN'), async (req, res) => {
  try {
    const { hostelId } = req.query;
    const where = {};

    if (req.user.role === 'SUPER_ADMIN') {
      if (hostelId) {
        where.staffProfile = { hostelId };
      }
    } else {
      // HOSTEL_ADMIN can only view staff belonging to their hostels
      const allowedHostelIds = req.access.hostelIds || [];
      if (hostelId) {
        if (!allowedHostelIds.includes(hostelId)) {
          return res.status(403).json({ message: 'Unauthorized for this hostel' });
        }
        where.staffProfile = { hostelId };
      } else {
        where.staffProfile = { hostelId: { in: allowedHostelIds } };
      }
    }

    where.role = 'STAFF';

    const staffMembers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        permissions: true,
        createdAt: true,
        staffProfile: {
          include: {
            hostel: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Merge default staff permissions with custom overrides for frontend display
    const mapped = staffMembers.map((s) => ({
      ...s,
      effectivePermissions: {
        ...DEFAULT_PERMISSIONS.STAFF,
        ...(s.permissions || {})
      }
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create new Staff Member with On/Off menu permissions
router.post('/', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN'), async (req, res) => {
  try {
    const { name, email, password, phone, hostelId, permissions } = req.body;

    if (req.user.role !== 'SUPER_ADMIN' && !req.access.hostelIds.includes(hostelId)) {
      return res.status(403).json({ message: 'Unauthorized to add staff to this hostel' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'staff123', salt);

    const staffUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'STAFF',
        permissions: permissions || DEFAULT_PERMISSIONS.STAFF,
        staffProfile: {
          create: {
            hostelId
          }
        }
      },
      include: {
        staffProfile: {
          include: {
            hostel: { select: { id: true, name: true } }
          }
        }
      }
    });

    res.status(201).json(staffUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update staff permissions (On/Off toggle switches)
router.put('/:id/permissions', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const { permissions } = req.body;

    const staffUser = await prisma.user.findFirst({
      where: { id: staffId, role: 'STAFF' },
      include: { staffProfile: true }
    });

    if (!staffUser) return res.status(404).json({ message: 'Staff member not found' });

    if (
      req.user.role !== 'SUPER_ADMIN' &&
      staffUser.staffProfile &&
      !req.access.hostelIds.includes(staffUser.staffProfile.hostelId)
    ) {
      return res.status(403).json({ message: 'Unauthorized for this staff member' });
    }

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: { permissions },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true
      }
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Remove / Delete staff member
router.delete('/:id', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN'), async (req, res) => {
  try {
    const staffId = req.params.id;

    const staffUser = await prisma.user.findFirst({
      where: { id: staffId, role: 'STAFF' },
      include: { staffProfile: true }
    });

    if (!staffUser) return res.status(404).json({ message: 'Staff member not found' });

    if (
      req.user.role !== 'SUPER_ADMIN' &&
      staffUser.staffProfile &&
      !req.access.hostelIds.includes(staffUser.staffProfile.hostelId)
    ) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await prisma.user.delete({ where: { id: staffId } });
    res.json({ message: 'Staff member removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
