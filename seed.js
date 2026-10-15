const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('🔄 Checking & syncing database records for TAVYN...');

  const salt = await bcrypt.genSalt(10);
  const defaultPassword = await bcrypt.hash('admin123', salt);

  // 1. ADMIN USER
  let admin = await prisma.user.findUnique({ where: { email: 'owner@tavyn.com' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Rajesh Sharma',
        email: 'owner@tavyn.com',
        password: defaultPassword,
        phone: '9876543210',
        role: 'HOSTEL_ADMIN'
      }
    });
    console.log('✅ Created Admin user: Rajesh Sharma (owner@tavyn.com)');
  } else {
    console.log('ℹ️ Admin user verified: Rajesh Sharma (owner@tavyn.com)');
  }

  // 2. STAFF USER
  let staffUser = await prisma.user.findUnique({ where: { email: 'staff@tavyn.com' } });
  if (!staffUser) {
    staffUser = await prisma.user.create({
      data: {
        name: 'Pooja Verma',
        email: 'staff@tavyn.com',
        password: defaultPassword,
        phone: '9876500001',
        role: 'STAFF'
      }
    });
    console.log('✅ Created Staff user: Pooja Verma (staff@tavyn.com)');
  }

  // 3. HOSTEL
  let hostel = await prisma.hostel.findFirst({ where: { name: 'TAVYN Heights' } });
  if (!hostel) {
    hostel = await prisma.hostel.create({
      data: {
        name: 'TAVYN Heights',
        address: '102 Main Street, Tech City',
        adminId: admin.id
      }
    });
    console.log('✅ Created Hostel: TAVYN Heights');
  } else {
    console.log('ℹ️ Hostel verified:', hostel.name);
  }

  // 4. STAFF PROFILE
  const existingStaffProfile = await prisma.staffProfile.findUnique({ where: { userId: staffUser.id } });
  if (!existingStaffProfile) {
    await prisma.staffProfile.create({
      data: {
        userId: staffUser.id,
        hostelId: hostel.id
      }
    });
  }

  // 5. FLOORS
  const floorNames = ['Floor 1', 'Floor 2', 'Floor 3'];
  const floors = {};
  for (const name of floorNames) {
    let floor = await prisma.floor.findFirst({ where: { name, hostelId: hostel.id } });
    if (!floor) {
      floor = await prisma.floor.create({
        data: { name, hostelId: hostel.id }
      });
    }
    floors[name] = floor;
  }
  console.log('✅ Floors verified: Floor 1, Floor 2, Floor 3');

  // 6. ROOMS CONFIGURATION
  const roomsData = [
    { floor: 'Floor 1', roomNumber: '101', capacity: 2, type: 'Double Sharing' },
    { floor: 'Floor 1', roomNumber: '102', capacity: 3, type: 'Triple Sharing' },
    { floor: 'Floor 2', roomNumber: '201', capacity: 2, type: 'Double Sharing' },
    { floor: 'Floor 2', roomNumber: '202', capacity: 1, type: 'Single Deluxe' },
    { floor: 'Floor 3', roomNumber: '301', capacity: 2, type: 'Double Sharing' },
    { floor: 'Floor 3', roomNumber: '302', capacity: 2, type: 'Double Sharing' }
  ];

  const rooms = {};
  for (const r of roomsData) {
    const floor = floors[r.floor];
    let room = await prisma.room.findFirst({
      where: { roomNumber: r.roomNumber, floorId: floor.id }
    });
    if (!room) {
      room = await prisma.room.create({
        data: {
          floorId: floor.id,
          roomNumber: r.roomNumber,
          capacity: r.capacity,
          type: r.type
        }
      });
    }
    rooms[r.roomNumber] = room;
  }
  console.log(`✅ Rooms verified: ${Object.keys(rooms).length} rooms configured`);

  // 7. BEDS CONFIGURATION
  const bedSpecs = [
    { roomNumber: '101', bedNumber: 'B1', status: 'Occupied' },
    { roomNumber: '101', bedNumber: 'B2', status: 'Available' },
    { roomNumber: '102', bedNumber: 'B1', status: 'Occupied' },
    { roomNumber: '102', bedNumber: 'B2', status: 'Occupied' },
    { roomNumber: '102', bedNumber: 'B3', status: 'Available' },
    { roomNumber: '201', bedNumber: 'B1', status: 'Occupied' },
    { roomNumber: '201', bedNumber: 'B2', status: 'Available' },
    { roomNumber: '202', bedNumber: 'B1', status: 'Occupied' },
    { roomNumber: '301', bedNumber: 'B1', status: 'Available' },
    { roomNumber: '301', bedNumber: 'B2', status: 'Available' },
    { roomNumber: '302', bedNumber: 'B1', status: 'Available' },
    { roomNumber: '302', bedNumber: 'B2', status: 'Available' }
  ];

  const beds = {};
  for (const b of bedSpecs) {
    const room = rooms[b.roomNumber];
    let bed = await prisma.bed.findFirst({
      where: { roomId: room.id, bedNumber: b.bedNumber }
    });
    if (!bed) {
      bed = await prisma.bed.create({
        data: {
          roomId: room.id,
          bedNumber: b.bedNumber,
          status: b.status
        }
      });
    } else {
      // Update status to match seed expectation if bed has no tenant
      const hasTenant = await prisma.tenant.findUnique({ where: { bedId: bed.id } });
      if (!hasTenant && bed.status !== b.status) {
        bed = await prisma.bed.update({
          where: { id: bed.id },
          data: { status: b.status }
        });
      }
    }
    beds[`${b.roomNumber}-${b.bedNumber}`] = bed;
  }
  console.log(`✅ Beds verified: ${Object.keys(beds).length} beds ready across all floors`);

  // 8. TENANTS CONFIGURATION
  const tenantsData = [
    {
      name: 'Rahul Sharma',
      phone: '9811223344',
      email: 'rahul.s@example.com',
      rentAmount: 8500,
      bedKey: '101-B1',
      rentPaid: true
    },
    {
      name: 'Priya Singh',
      phone: '9822334455',
      email: 'priya.singh@example.com',
      rentAmount: 7500,
      bedKey: '102-B1',
      rentPaid: true
    },
    {
      name: 'Amit Patel',
      phone: '9833445566',
      email: 'amit.patel@example.com',
      rentAmount: 7500,
      bedKey: '102-B2',
      rentPaid: false // Pending due
    },
    {
      name: 'Vikram Malhotra',
      phone: '9844556677',
      email: 'vikram.m@example.com',
      rentAmount: 9000,
      bedKey: '201-B1',
      rentPaid: true
    },
    {
      name: 'Ananya Iyer',
      phone: '9855667788',
      email: 'ananya.iyer@example.com',
      rentAmount: 12000,
      bedKey: '202-B1',
      rentPaid: false // Pending due
    }
  ];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  for (const t of tenantsData) {
    const bed = beds[t.bedKey];
    let tenant = await prisma.tenant.findFirst({ where: { phone: t.phone } });

    // Check if target bed is occupied by someone else
    let targetBedId = null;
    if (bed) {
      const occupant = await prisma.tenant.findFirst({ where: { bedId: bed.id } });
      if (!occupant || (tenant && occupant.id === tenant.id)) {
        targetBedId = bed.id;
      }
    }

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: t.name,
          phone: t.phone,
          email: t.email,
          rentAmount: t.rentAmount,
          securityDeposit: t.rentAmount * 2,
          bedId: targetBedId,
          status: 'Active'
        }
      });
      if (targetBedId) {
        await prisma.bed.update({ where: { id: targetBedId }, data: { status: 'Occupied' } });
      }
    } else if (targetBedId && tenant.bedId !== targetBedId) {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { bedId: targetBedId } });
      await prisma.bed.update({ where: { id: targetBedId }, data: { status: 'Occupied' } });
    }

    // 9. RENT & PAYMENT SYNC FOR CURRENT MONTH
    let rent = await prisma.rent.findFirst({
      where: {
        tenantId: tenant.id,
        month: currentMonth,
        year: currentYear
      }
    });

    const rentStatus = t.rentPaid ? 'Paid' : 'Pending';

    if (!rent) {
      rent = await prisma.rent.create({
        data: {
          tenantId: tenant.id,
          month: currentMonth,
          year: currentYear,
          amount: t.rentAmount,
          status: rentStatus
        }
      });
    } else if (rent.status !== rentStatus) {
      rent = await prisma.rent.update({
        where: { id: rent.id },
        data: { status: rentStatus }
      });
    }

    // If paid, create payment record if not present
    if (t.rentPaid) {
      const payment = await prisma.payment.findFirst({
        where: { rentId: rent.id }
      });
      if (!payment) {
        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            rentId: rent.id,
            amount: t.rentAmount,
            method: 'UPI',
            referenceId: `UPI-${Date.now().toString().slice(-6)}`,
            date: new Date()
          }
        });
      }
    }
  }
  console.log(`✅ Tenants & Rent synced: ${tenantsData.length} active tenants with current month (${currentMonth}/${currentYear}) billing`);

  // 10. ELECTRICITY READINGS
  const electricityData = [
    { roomKey: '101', prev: 18200, curr: 18295, units: 95, rate: 8.0 },
    { roomKey: '102', prev: 24100, curr: 24240, units: 140, rate: 8.0 },
    { roomKey: '201', prev: 12500, curr: 12610, units: 110, rate: 8.0 }
  ];

  for (const el of electricityData) {
    const room = rooms[el.roomKey];
    if (room) {
      const existing = await prisma.electricityReading.findFirst({
        where: { roomId: room.id, month: currentMonth, year: currentYear }
      });
      if (!existing) {
        const net = el.units * el.rate;
        await prisma.electricityReading.create({
          data: {
            roomId: room.id,
            month: currentMonth,
            year: currentYear,
            previousReading: el.prev,
            currentReading: el.curr,
            unitsConsumed: el.units,
            ratePerUnit: el.rate,
            billAmount: net,
            netAmount: net
          }
        });
      }
    }
  }
  console.log(`✅ Electricity readings logged for ${electricityData.length} rooms`);

  // 11. EXPENSES
  const sampleExpenses = [
    { category: 'Maintenance', amount: 3500, description: 'Plumbing & water pump service' },
    { category: 'Utilities', amount: 2400, description: 'High-speed Fiber WiFi subscription' },
    { category: 'Housekeeping', amount: 1800, description: 'Cleaning supplies & sanitization' }
  ];

  for (const exp of sampleExpenses) {
    const exists = await prisma.expense.findFirst({
      where: { hostelId: hostel.id, category: exp.category, amount: exp.amount }
    });
    if (!exists) {
      await prisma.expense.create({
        data: {
          hostelId: hostel.id,
          category: exp.category,
          amount: exp.amount,
          description: exp.description,
          date: new Date()
        }
      });
    }
  }
  console.log(`✅ Operational expenses verified: ${sampleExpenses.length} entries`);

  // 12. METRICS RECAP
  const totalBedsCount = await prisma.bed.count({ where: { room: { floor: { hostelId: hostel.id } } } });
  const occupiedBedsCount = await prisma.bed.count({ where: { status: 'Occupied', room: { floor: { hostelId: hostel.id } } } });
  const vacantBedsCount = totalBedsCount - occupiedBedsCount;

  const currentMonthRents = await prisma.rent.findMany({
    where: { month: currentMonth, year: currentYear }
  });
  const collected = currentMonthRents.filter(r => r.status === 'Paid').reduce((sum, r) => sum + r.amount, 0);
  const pendingDues = currentMonthRents.filter(r => r.status !== 'Paid').reduce((sum, r) => sum + r.amount, 0);

  console.log('\n--------------------------------------------------');
  console.log('📊 Current Live Dashboard Metrics:');
  console.log(`   • Total Beds: ${totalBedsCount} (${occupiedBedsCount} Occupied, ${vacantBedsCount} Available)`);
  console.log(`   • Occupancy Rate: ${Math.round((occupiedBedsCount / totalBedsCount) * 100)}%`);
  console.log(`   • Monthly Collections: ₹${collected.toLocaleString()}`);
  console.log(`   • Pending Rent Dues: ₹${pendingDues.toLocaleString()}`);
  console.log('--------------------------------------------------\n');
}

seed()
  .catch((err) => {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
