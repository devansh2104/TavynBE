const fs = require('fs');

async function runTests() {
  const baseUrl = 'http://localhost:5000/api/v1';
  let logs = [];
  let token = '';
  let hostelId = '';
  let floorId = '';
  let roomId = '';
  let bedId = '';
  let tenantId = '';
  let rentId = '';

  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  const request = async (method, endpoint, body = null, useAuth = true) => {
    const headers = { 'Content-Type': 'application/json' };
    if (useAuth && token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  try {
    log('--- STARTING API TESTS ---');

    // 1. Register
    log('\n1. Testing Auth Register...');
    const regEmail = `owner${Date.now()}@test.com`;
    let res = await request('POST', '/auth/register', {
      name: 'Test Owner', email: regEmail, password: 'password123', phone: '1234567890'
    }, false);
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    // 2. Login
    log('\n2. Testing Auth Login...');
    res = await request('POST', '/auth/login', {
      email: regEmail, password: 'password123'
    }, false);
    log(`Status: ${res.status}. Token received: ${!!res.data.token}`);
    if (res.data.token) token = res.data.token;
    else throw new Error('Login failed');

    // 3. Create Hostel
    log('\n3. Testing Create Hostel...');
    res = await request('POST', '/hostels', {
      name: 'Sunrise Hostel', address: '123 Test Street'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);
    hostelId = res.data.id;

    // 4. Create Floor
    log('\n4. Testing Create Floor...');
    res = await request('POST', `/hostels/${hostelId}/floors`, {
      name: 'Ground Floor'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);
    floorId = res.data.id;

    // 5. Create Room
    log('\n5. Testing Create Room...');
    res = await request('POST', `/rooms`, {
      floorId, roomNumber: '101', capacity: 2, type: 'AC'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);
    roomId = res.data.id;

    // 6. Create Bed
    log('\n6. Testing Create Bed...');
    res = await request('POST', `/rooms/${roomId}/beds`, {
      bedNumber: '101-A'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);
    bedId = res.data.id;

    // 7. Add Tenant
    log('\n7. Testing Add Tenant (Check-in)...');
    res = await request('POST', `/tenants`, {
      name: 'John Doe', email: 'john@example.com', phone: '9876543210', rentAmount: 5000, bedId
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);
    tenantId = res.data.id;

    // 8. Generate Rent
    log('\n8. Testing Generate Monthly Rent...');
    res = await request('POST', `/finance/rent/generate-monthly`, {
      month: 9, year: 2026
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    // Fetch Rent to get rentId
    log('\n9. Fetching Rent Records...');
    res = await request('GET', `/finance/rent`);
    log(`Status: ${res.status}. Records found: ${res.data.length}`);
    if (res.data.length > 0) rentId = res.data[0].id;

    // 10. Record Payment
    log('\n10. Testing Record Payment...');
    res = await request('POST', `/finance/payments`, {
      tenantId, rentId, amount: 5000, method: 'UPI', referenceId: 'TXN12345'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    // 11. Add Expense
    log('\n11. Testing Add Expense...');
    res = await request('POST', `/finance/expenses`, {
      hostelId, category: 'Maintenance', amount: 1500, description: 'Plumbing fix', date: '2026-09-22'
    });
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    // 12. Dashboard Overview
    log('\n12. Testing Dashboard Overview...');
    res = await request('GET', `/dashboard/overview`);
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    // 13. Checkout Tenant
    log('\n13. Testing Tenant Checkout...');
    res = await request('PUT', `/tenants/${tenantId}/checkout`);
    log(`Status: ${res.status}. Response: ${JSON.stringify(res.data)}`);

    log('\n--- ALL TESTS COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    log(`\nERROR DURING TESTS: ${error.message}`);
  }

  fs.writeFileSync('../api_test_results.txt', logs.join('\n'));
  console.log('Results saved to api_test_results.txt');
}

runTests();
