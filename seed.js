const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  let user = await prisma.user.findFirst();
  if (!user) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    user = await prisma.user.create({
      data: {
        name: 'Rajesh Sharma',
        email: 'owner@tavyn.com',
        password: hashedPassword,
        phone: '9876543210',
        role: 'HOSTEL_ADMIN'
      }
    });
    console.log('Created user:', user.email);
  } else {
    console.log('Existing user found:', user.email);
  }

  let hostel = await prisma.hostel.findFirst();
  if (!hostel) {
    hostel = await prisma.hostel.create({
      data: {
        name: 'TAVYN Heights',
        address: '102 Main Street, Tech City',
        adminId: user.id
      }
    });
    console.log('Created hostel:', hostel.name);

    const floor1 = await prisma.floor.create({
      data: { name: 'Floor 1', hostelId: hostel.id }
    });
    const floor2 = await prisma.floor.create({
      data: { name: 'Floor 2', hostelId: hostel.id }
    });

    const room101 = await prisma.room.create({
      data: { floorId: floor1.id, roomNumber: '101', capacity: 2 }
    });
    const room102 = await prisma.room.create({
      data: { floorId: floor1.id, roomNumber: '102', capacity: 3 }
    });
    const room201 = await prisma.room.create({
      data: { floorId: floor2.id, roomNumber: '201', capacity: 2 }
    });

    const b1 = await prisma.bed.create({ data: { roomId: room101.id, bedNumber: 'B1', status: 'Occupied' } });
    const b2 = await prisma.bed.create({ data: { roomId: room101.id, bedNumber: 'B2', status: 'Available' } });
    const b3 = await prisma.bed.create({ data: { roomId: room102.id, bedNumber: 'B1', status: 'Available' } });
    const b4 = await prisma.bed.create({ data: { roomId: room201.id, bedNumber: 'B1', status: 'Available' } });

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Rahul Sharma',
        phone: '9811223344',
        rentAmount: 8500,
        bedId: b1.id,
        status: 'Active'
      }
    });

    await prisma.rent.create({
      data: {
        tenantId: tenant.id,
        month: 10,
        year: 2026,
        amount: 8500,
        status: 'Pending'
      }
    });

    await prisma.electricityReading.create({
      data: {
        roomId: room101.id,
        month: 9,
        year: 2026,
        previousReading: 18200,
        currentReading: 18290,
        unitsConsumed: 90,
        billAmount: 720
      }
    });

    await prisma.expense.create({
      data: {
        hostelId: hostel.id,
        category: 'Repair',
        amount: 3500,
        description: 'Plumbing and water pump maintenance',
        date: new Date()
      }
    });

    console.log('Seeding completed successfully!');
  } else {
    console.log('Hostel already exists:', hostel.name);
  }
}

seed()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
