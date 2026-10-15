const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize, DEFAULT_PERMISSIONS } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

// 1. Get default role permissions
router.get('/role-permissions', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const roles = ['HOSTEL_ADMIN', 'STAFF', 'TENANT'];
    const dbPerms = await prisma.rolePermission.findMany();
    const map = {};

    roles.forEach((r) => {
      const match = dbPerms.find((p) => p.role === r);
      map[r] = match ? match.permissions : DEFAULT_PERMISSIONS[r];
    });

    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Super Admin updates default role permissions
router.put('/role-permissions/:role', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    const upserted = await prisma.rolePermission.upsert({
      where: { role },
      update: { permissions },
      create: { role, permissions }
    });

    res.json(upserted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Super Admin: List all Hostel Admins with their menu permissions
router.get('/hostel-admins', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'HOSTEL_ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        permissions: true,
        hostels: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapped = admins.map((a) => ({
      ...a,
      effectivePermissions: {
        ...DEFAULT_PERMISSIONS.HOSTEL_ADMIN,
        ...(a.permissions || {})
      }
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Super Admin: Update permissions for a specific Hostel Admin
router.put('/user/:id/permissions', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const userId = req.params.id;
    const { permissions } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
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

module.exports = router;
