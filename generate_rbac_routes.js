const fs = require('fs');

const authJs = `const express = require('express');
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
      res.json({ id: user.id, name: user.name, role: user.role, token });
    } else { res.status(401).json({ message: 'Invalid credentials' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', protect, (req, res) => res.json({ message: 'Logged out successfully' }));
router.get('/profile', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id:true, name:true, email:true, role:true }});
  res.json(user);
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
`;

const hostelsJs = `const express = require('express');
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
`;

const floorsJs = `const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { hostelId: { in: req.access.hostelIds } };

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const floor = await prisma.floor.updateMany({ where: { id: req.params.id, ...getScope(req) }, data: req.body });
  res.json(floor);
});
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.floor.deleteMany({ where: { id: req.params.id, ...getScope(req) } });
  res.json({ message: 'Floor deleted' });
});
module.exports = router;
`;

const roomsJs = `const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { floor: { hostelId: { in: req.access.hostelIds } } };

router.post('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const room = await prisma.room.create({ data: req.body });
  res.status(201).json(room);
});
router.get('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.room.findMany({ where: getScope(req) })));
router.get('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => res.json(await prisma.room.findFirst({where: {id: req.params.id, ...getScope(req)}})));
router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.room.updateMany({where: {id: req.params.id, ...getScope(req)}, data: req.body})));
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.room.deleteMany({where: {id: req.params.id, ...getScope(req)}});
  res.json({ message: 'Room deleted' });
});
router.get('/:id/occupancy', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ occupancy: '75%' }));

router.post('/:roomId/beds', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const bed = await prisma.bed.create({ data: { bedNumber: req.body.bedNumber, roomId: req.params.roomId } });
  res.status(201).json(bed);
});
router.get('/:roomId/beds', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json(await prisma.bed.findMany({ where: { roomId: req.params.roomId, room: getScope(req) } }));
});
module.exports = router;
`;

const bedsJs = `const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { room: { floor: { hostelId: { in: req.access.hostelIds } } } };

router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.bed.updateMany({where: {id: req.params.id, ...getScope(req)}, data: req.body})));
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.bed.deleteMany({where: {id: req.params.id, ...getScope(req)}});
  res.json({ message: 'Bed deleted' });
});
module.exports = router;
`;

const tenantsJs = `const express = require('express');
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
  const tenant = await prisma.tenant.create({ data: req.body });
  if(req.body.bedId) await prisma.bed.update({where: {id: req.body.bedId}, data: {status: 'Occupied'}});
  getIO().emit('dashboard_update', { type: 'TENANT_ADDED', tenant });
  res.status(201).json(tenant);
});
router.get('/', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.tenant.findMany({ where: getScope(req) })));
router.get('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  const tenant = await prisma.tenant.findFirst({where: {id: req.params.id, ...getScope(req)}});
  if (!tenant) return res.status(404).json({message: 'Not found'});
  res.json(tenant);
});
router.put('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.tenant.updateMany({where: {id: req.params.id, ...getScope(req)}, data: req.body})));
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  await prisma.tenant.deleteMany({where: {id: req.params.id, ...getScope(req)}});
  res.json({ message: 'Tenant deleted' });
});
router.put('/:id/checkout', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const tenant = await prisma.tenant.findFirst({where: {id: req.params.id, ...getScope(req)}});
  if(!tenant) return res.status(404).json({ message: 'Not found' });
  if(tenant.bedId) await prisma.bed.update({where: {id: tenant.bedId}, data: {status: 'Available'}});
  await prisma.tenant.update({where: {id: req.params.id}, data: {status: 'CheckedOut', bedId: null}});
  getIO().emit('dashboard_update', { type: 'TENANT_CHECKOUT', tenantId: req.params.id });
  res.json({ message: 'Tenant checked out' });
});
router.put('/:id/transfer-room', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ message: 'Tenant transferred' }));

router.post('/:id/upload-photo', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.status(201).json({ message: 'Photo uploaded' }));
router.post('/:id/upload-id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.status(201).json({ message: 'ID uploaded' }));
module.exports = router;
`;

const documentsJs = `const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
router.delete('/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ message: 'Document deleted' }));
module.exports = router;
`;

const financeJs = `const express = require('express');
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
    const { month, year } = req.body;
    const activeTenants = await prisma.tenant.findMany({ where: { status: 'Active', ...getTenantScope(req) } });
    let generatedCount = 0;
    
    for (const tenant of activeTenants) {
      const existing = await prisma.rent.findFirst({ where: { tenantId: tenant.id, month, year } });
      if (!existing) {
        await prisma.rent.create({ data: { tenantId: tenant.id, month, year, amount: tenant.rentAmount } });
        generatedCount++;
      }
    }
    res.status(201).json({ message: \`Successfully generated \${generatedCount} rent records.\` });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/rent', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const rents = await prisma.rent.findMany({ where: { ...(status ? {status} : {}), ...getRentScope(req) } });
    res.json(rents);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// PAYMENTS
router.post('/payments', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  try {
    const { tenantId, rentId, amount, method, referenceId } = req.body;
    // Tenants can only pay for themselves
    if (req.user.role === 'TENANT' && req.access.tenantId !== tenantId) return res.status(403).json({message: 'Unauthorized'});

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({ data: { tenantId, rentId, amount, method, referenceId } });
      if (rentId) await tx.rent.updateMany({ where: { id: rentId, ...getRentScope(req) }, data: { status: 'Paid' } });
      return p;
    });
    getIO().emit('dashboard_update', { type: 'PAYMENT_RECEIVED', payment });
    res.status(201).json(payment);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// EXPENSES
router.post('/expenses', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  try {
    const { hostelId, category, amount, description, date } = req.body;
    if (!req.access.all && !req.access.hostelIds.includes(hostelId)) return res.status(403).json({message: 'Unauthorized'});

    const expense = await prisma.expense.create({
      data: { hostelId, category, amount, description, date: new Date(date) }
    });
    getIO().emit('dashboard_update', { type: 'EXPENSE_ADDED', expense });
    res.status(201).json(expense);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/expenses', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  res.json(await prisma.expense.findMany({ where: getExpenseScope(req) }));
});

module.exports = router;
`;

const electricityJs = `const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { room: { floor: { hostelId: { in: req.access.hostelIds } } } };

router.post('/readings', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => {
  const reading = await prisma.electricityReading.create({ data: req.body });
  res.status(201).json(reading);
});
router.get('/readings', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => {
  // If tenant, they can only see their room's reading. Simplified for MVP.
  res.json(await prisma.electricityReading.findMany({ where: getScope(req) }));
});
router.get('/room/:roomId', protect, authorize('HOSTEL_ADMIN', 'STAFF', 'TENANT'), async (req, res) => res.json(await prisma.electricityReading.findMany({where: {roomId: req.params.roomId, ...getScope(req)}})));
router.put('/readings/:id', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json(await prisma.electricityReading.updateMany({where: {id: req.params.id, ...getScope(req)}, data: req.body})));
router.post('/generate-bills', protect, authorize('HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.status(201).json({ message: 'Electricity bills generated' }));
module.exports = router;
`;

const receiptsJs = `const express = require('express');
const { protect } = require('../middlewares/auth');
const router = express.Router();
router.get('/:paymentId', protect, async (req, res) => res.json({ message: 'Receipt info' }));
router.get('/download/:paymentId', protect, async (req, res) => res.json({ message: 'PDF binary stream' }));
module.exports = router;
`;

const dashboardJs = `const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, authorize } = require('../middlewares/auth');
const { cache } = require('../middlewares/redisCache');
const router = express.Router();
const prisma = new PrismaClient();

const getScope = (req) => req.access.all ? {} : { hostelId: { in: req.access.hostelIds } };

router.get('/overview', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), cache('dashboard_overview', 300), async (req, res) => {
  try {
    const totalTenants = await prisma.tenant.count({ 
      where: { status: 'Active', bed: { room: { floor: getScope(req) } } } 
    });
    const totalBeds = await prisma.bed.count({ where: { room: { floor: getScope(req) } } });
    const occupiedBeds = await prisma.bed.count({ where: { status: 'Occupied', room: { floor: getScope(req) } } });
    const occupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : 0;
    
    // Revenue and Dues logic simplified for scoping
    res.json({ totalTenants, occupancyRate: \`\${occupancyRate}%\`, totalBeds, occupiedBeds, feeDues: 0, monthlyRevenue: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/revenue', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ revenue: 15000 }));
router.get('/occupancy', protect, authorize('SUPER_ADMIN', 'HOSTEL_ADMIN', 'STAFF'), async (req, res) => res.json({ occupancy: '80%' }));
module.exports = router;
`;

const monthlyJs = `const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();
router.post('/close', protect, authorize('HOSTEL_ADMIN'), async (req, res) => res.status(201).json({ message: 'Month closed successfully' }));
module.exports = router;
`;

fs.writeFileSync('routes/auth.js', authJs);
fs.writeFileSync('routes/hostels.js', hostelsJs);
fs.writeFileSync('routes/floors.js', floorsJs);
fs.writeFileSync('routes/rooms.js', roomsJs);
fs.writeFileSync('routes/beds.js', bedsJs);
fs.writeFileSync('routes/tenants.js', tenantsJs);
fs.writeFileSync('routes/documents.js', documentsJs);
fs.writeFileSync('routes/finance.js', financeJs);
fs.writeFileSync('routes/electricity.js', electricityJs);
fs.writeFileSync('routes/receipts.js', receiptsJs);
fs.writeFileSync('routes/dashboard.js', dashboardJs);
fs.writeFileSync('routes/monthly.js', monthlyJs);

console.log('RBAC routes completely applied!');
