const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

// 1. Auth APIs
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) return res.status(400).json({ message: 'User already exists' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    user = await prisma.user.create({ 
      data: { name, email, password: hashedPassword, phone, role: role || 'HOSTEL_ADMIN' } 
    });
    res.status(201).json({ message: 'User registered successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        token
      });
    } else { res.status(401).json({ message: 'Invalid credentials' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', protect, (req, res) => res.json({ message: 'Logged out successfully' }));
router.get('/profile', protect, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true, permissions: true }
  });
  res.json({
    ...user,
    effectivePermissions: req.effectivePermissions
  });
});
router.put('/profile', protect, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: req.body });
  res.json({ message: 'Profile updated' });
});
router.put('/change-password', protect, async (req, res) => res.json({ message: 'Password changed' }));

// 1.1 New RBAC Invite APIs
router.post('/staff', protect, authorize('HOSTEL_ADMIN'), async (req, res) => {
  const { name, email, password, phone, hostelId } = req.body;
  if (!req.access.hostelIds.includes(hostelId)) return res.status(403).json({ message: 'Unauthorized for this hostel' });
  
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  const user = await prisma.user.create({ 
    data: { name, email, password: hashedPassword, phone, role: 'STAFF', staffProfile: { create: { hostelId } } } 
  });
  res.status(201).json(user);
});

router.get('/system-stats', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  const users = await prisma.user.count();
  const hostels = await prisma.hostel.count();
  const tenants = await prisma.tenant.count();
  res.json({ users, hostels, tenants });
});

module.exports = { router };
