const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Default permission fallbacks per role
const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: {
    dashboard: true,
    tenants: true,
    rooms: true,
    rent: true,
    electricity: true,
    expenses: true,
    reports: true,
    staff: true,
    access_control: true
  },
  HOSTEL_ADMIN: {
    dashboard: true,
    tenants: true,
    rooms: true,
    rent: true,
    electricity: true,
    expenses: true,
    reports: true,
    staff: true,
    access_control: false
  },
  STAFF: {
    dashboard: true,
    tenants: true,
    rooms: true,
    rent: true,
    electricity: true,
    expenses: false,
    reports: false,
    staff: false,
    access_control: false
  },
  TENANT: {
    dashboard: true,
    tenants: false,
    rooms: false,
    rent: true,
    electricity: true,
    expenses: false,
    reports: false,
    staff: false,
    access_control: false
  }
};

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user with profiles
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        staffProfile: true,
        tenantProfile: true,
        hostels: { select: { id: true } }
      }
    });

    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;

    // Resolve active effective permissions
    let rolePerm = await prisma.rolePermission.findUnique({ where: { role: user.role } }).catch(() => null);
    const basePerms = rolePerm?.permissions || DEFAULT_PERMISSIONS[user.role] || {};
    
    // User-specific overrides take priority over role-level defaults
    const userOverrides = user.permissions || {};
    req.effectivePermissions = { ...basePerms, ...userOverrides };

    // Attach access scopes
    req.access = { all: false, hostelIds: [], tenantId: null };
    
    if (user.role === 'SUPER_ADMIN') {
      req.access.all = true;
    } 
    else if (user.role === 'HOSTEL_ADMIN') {
      req.access.hostelIds = user.hostels.map(h => h.id);
    } 
    else if (user.role === 'STAFF' && user.staffProfile) {
      req.access.hostelIds = [user.staffProfile.hostelId];
    } 
    else if (user.role === 'TENANT' && user.tenantProfile) {
      req.access.tenantId = user.tenantProfile.id;
    }

    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (req.user.role === 'SUPER_ADMIN') return next();
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

// Menu / Feature-level permission guard
const checkPermission = (menuKey) => {
  return (req, res, next) => {
    if (req.user.role === 'SUPER_ADMIN') return next();

    const allowed = req.effectivePermissions?.[menuKey];
    if (allowed === false) {
      return res.status(403).json({ 
        message: `Forbidden: Access to ${menuKey} is disabled for your account` 
      });
    }
    next();
  };
};

module.exports = { protect, authorize, checkPermission, DEFAULT_PERMISSIONS };
