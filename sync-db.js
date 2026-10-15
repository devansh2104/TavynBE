require('dotenv').config();
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');

async function syncDatabase() {
  console.log('==================================================');
  console.log('   TAVYN Hostel Management - Database Auto-Sync   ');
  console.log('==================================================\n');

  const dbUrlString = process.env.DATABASE_URL;
  if (!dbUrlString) {
    console.error('❌ Error: DATABASE_URL is not defined in .env');
    console.error('👉 Please make sure a .env file exists in the server folder with DATABASE_URL.');
    console.error('   Example: DATABASE_URL="mysql://root:password@localhost:3306/hostel_management"\n');
    process.exit(1);
  }

  // Parse connection details
  let dbUrl;
  try {
    dbUrl = new URL(dbUrlString);
  } catch (err) {
    console.error('❌ Error: Invalid DATABASE_URL format.');
    console.error(err.message);
    process.exit(1);
  }

  const user = decodeURIComponent(dbUrl.username || 'root');
  const password = decodeURIComponent(dbUrl.password || '');
  const host = dbUrl.hostname || 'localhost';
  const port = parseInt(dbUrl.port || '3306', 10);
  const dbName = dbUrl.pathname.replace(/^\//, '') || 'hostel_management';

  console.log(`📡 Connecting to MySQL server at ${host}:${port} as '${user}'...`);

  // Step 1: Connect to MySQL server (without selecting DB) and ensure DB exists
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password
    });
    console.log('✅ Connected to MySQL server successfully.');
  } catch (err) {
    console.error(`\n❌ Failed to connect to MySQL server at ${host}:${port}`);
    console.error(`   Error: ${err.message}`);
    console.error('\n🔍 Troubleshooting Tips:');
    console.error('   1. Is MySQL server running on your device?');
    console.error('   2. Are the username and password in .env correct?');
    console.error('   3. If using XAMPP/WAMP, verify MySQL port (usually 3306).\n');
    process.exit(1);
  }

  try {
    console.log(`📦 Checking / Creating database '${dbName}'...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`✅ Database '${dbName}' is ready.`);
  } catch (err) {
    console.error(`❌ Failed to create/verify database: ${err.message}`);
    process.exit(1);
  } finally {
    await connection.end();
  }

  // Step 2: Push Prisma schema to MySQL
  console.log('\n🔄 Aligning database tables with schema.prisma (prisma db push)...');
  try {
    const isWindows = process.platform === 'win32';
    const npxCmd = isWindows ? 'npx.cmd' : 'npx';
    
    execSync(`${npxCmd} prisma db push --skip-generate`, {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log('✅ All tables, columns, and foreign keys are synced!');
  } catch (err) {
    console.error('\n❌ Prisma db push failed.');
    console.error(err.message);
    process.exit(1);
  }

  // Step 3: Generate Prisma Client
  console.log('\n⚙️  Generating latest Prisma client bindings...');
  try {
    const isWindows = process.platform === 'win32';
    const npxCmd = isWindows ? 'npx.cmd' : 'npx';
    
    execSync(`${npxCmd} prisma generate`, {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log('✅ Prisma client generated successfully.');
  } catch (err) {
    if (err.message && err.message.includes('EPERM')) {
      console.log('ℹ️  Prisma client file is currently locked by a running server process (already generated).');
    } else {
      console.warn('⚠️  Prisma generate warning:', err.message);
    }
  }

  // Step 4: Run updated idempotent database sync & seed
  console.log('\n🌱 Syncing latest operational updates & sample records...');
  try {
    const nodeCmd = 'node';
    execSync(`${nodeCmd} seed.js`, {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log('✅ Database records, beds, tenants, and current billing cycle synced successfully!');
  } catch (seedErr) {
    console.warn('⚠️  Seed sync warning:', seedErr.message);
  }

  console.log('\n==================================================');
  console.log('🎉 Database configuration and sync complete!');
  console.log('   Default Login:');
  console.log('   • Admin: owner@tavyn.com / admin123');
  console.log('   • Staff: staff@tavyn.com / admin123');
  console.log('==================================================\n');
}

syncDatabase();
