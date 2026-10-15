const fs = require('fs');

async function runAllTests() {
  const baseUrl = 'http://localhost:5000/api/v1';
  let logs = [];
  let token = '';
  
  // Variables to hold created entity IDs for subsequent requests
  let hostelId, floorId, roomId, bedId, tenantId, rentId, paymentId, expenseId, electricityId;

  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  const request = async (name, method, endpoint, body = null, useAuth = true) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (useAuth && token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      
      const data = await res.json().catch(() => ({}));
      const success = res.status >= 200 && res.status < 300;
      
      log(`API Request: ${name}`);
      log(`${method} ${baseUrl}${endpoint}`);
      log(`Response: ${res.status} ${JSON.stringify(data)}\n`);
      
      return { status: res.status, data, success };
    } catch (e) {
      log(`API Request: ${name}`);
      log(`${method} ${baseUrl}${endpoint}`);
      log(`Error: ${e.message}\n`);
      return { success: false };
    }
  };

  log('--- STARTING ALL 61 API TESTS ---\n');

  // 1. Auth APIs
  const regEmail = `owner${Date.now()}@test.com`;
  await request('Create owner account', 'POST', '/auth/register', { name: 'Test Owner', email: regEmail, password: 'password', phone: '123' }, false);
  const loginRes = await request('Authenticate owner and issue JWT', 'POST', '/auth/login', { email: regEmail, password: 'password' }, false);
  token = loginRes.data?.token || '';
  await request('Fetch owner profile', 'GET', '/auth/profile');
  await request('Update owner profile', 'PUT', '/auth/profile', { phone: '999' });
  await request('Change owner password', 'PUT', '/auth/change-password', { password: 'newpassword' });

  // 2. Hostel APIs
  const hostelRes = await request('Create a hostel', 'POST', '/hostels', { name: 'H1', address: 'A1' });
  hostelId = hostelRes.data?.id;
  await request('List hostels owned by the user', 'GET', '/hostels');
  await request('Get a hostel by ID', 'GET', `/hostels/${hostelId}`);
  await request('Update hostel details', 'PUT', `/hostels/${hostelId}`, { name: 'H2' });

  // 3. Floor APIs
  const floorRes = await request('Create a floor', 'POST', `/hostels/${hostelId}/floors`, { name: 'F1' });
  floorId = floorRes.data?.id;
  await request('List floors', 'GET', `/hostels/${hostelId}/floors`);
  await request('Update floor', 'PUT', `/floors/${floorId}`, { name: 'F2' });

  // 4. Room APIs
  const roomRes = await request('Create room', 'POST', '/rooms', { floorId, roomNumber: '101', capacity: 2 });
  roomId = roomRes.data?.id;
  await request('List/filter rooms', 'GET', '/rooms');
  await request('Get room details', 'GET', `/rooms/${roomId}`);
  await request('Update room', 'PUT', `/rooms/${roomId}`, { capacity: 3 });
  await request('Get room occupancy', 'GET', `/rooms/${roomId}/occupancy`);

  // 5. Bed APIs
  const bedRes = await request('Create bed', 'POST', `/rooms/${roomId}/beds`, { bedNumber: 'B1' });
  bedId = bedRes.data?.id;
  await request('List room beds', 'GET', `/rooms/${roomId}/beds`);
  await request('Update bed', 'PUT', `/beds/${bedId}`, { status: 'Available' });

  // 6. Tenant APIs
  const tenantRes = await request('Add tenant', 'POST', '/tenants', { name: 'T1', phone: '123', rentAmount: 1000, bedId });
  tenantId = tenantRes.data?.id;
  await request('List/search tenants', 'GET', '/tenants');
  await request('Get tenant details', 'GET', `/tenants/${tenantId}`);
  await request('Update tenant', 'PUT', `/tenants/${tenantId}`, { name: 'T2' });
  await request('Transfer tenant to another room/bed', 'PUT', `/tenants/${tenantId}/transfer-room`);

  // 7. Document APIs
  await request('Upload tenant profile photo', 'POST', `/documents/${tenantId}/upload-photo`);
  await request('Upload identity document', 'POST', `/documents/${tenantId}/upload-id`);
  await request('Delete uploaded document', 'DELETE', `/documents/123`); // Mock delete

  // 8. Rent APIs
  await request('Generate monthly rent for active tenants', 'POST', '/rent/generate-monthly');
  const rentList = await request('List rent records', 'GET', '/rent');
  rentId = rentList.data?.[0]?.id || '123';
  await request('Get a rent record', 'GET', `/rent/${rentId}`);
  await request('Add or update late fee', 'PUT', `/rent/${rentId}/late-fee`, { lateFee: 50 });
  await request('List pending/overdue rent', 'GET', '/rent/pending');

  // 9. Electricity APIs
  const elecRes = await request('Save meter reading', 'POST', '/electricity/readings', { roomId, month: 1, year: 2026, previousReading: 0, currentReading: 100, unitsConsumed: 100, billAmount: 500 });
  electricityId = elecRes.data?.id;
  await request('List readings', 'GET', '/electricity/readings');
  await request('Get room meter history', 'GET', `/electricity/room/${roomId}`);
  await request('Correct/update reading', 'PUT', `/electricity/readings/${electricityId}`, { currentReading: 105 });
  await request('Generate electricity bills', 'POST', '/electricity/generate-bills');

  // 10. Payment APIs
  const payRes = await request('Create payment record', 'POST', '/payments', { tenantId, amount: 1000, method: 'Cash' });
  paymentId = payRes.data?.id;
  await request('List payments', 'GET', '/payments');
  await request('Get payment details', 'GET', `/payments/${paymentId}`);
  await request('Get tenant payment history', 'GET', `/payments/history/${tenantId}`);
  
  // Back to rent to mark as paid (since payment logic is split in this generic scaffold)
  await request('Mark rent as paid / record payment', 'PUT', `/rent/${rentId}/pay`);

  // 11. Receipt APIs
  await request('Get receipt information', 'GET', `/receipts/${paymentId}`);
  await request('Download PDF receipt', 'GET', `/receipts/download/${paymentId}`);

  // 12. Expense APIs
  const expRes = await request('Add expense', 'POST', '/expenses', { hostelId, category: 'Food', amount: 500 });
  expenseId = expRes.data?.id;
  await request('List/filter expenses', 'GET', '/expenses');
  await request('Update expense', 'PUT', `/expenses/${expenseId}`, { amount: 600 });
  await request('Get expense summary', 'GET', '/expenses/summary');
  await request('Delete expense', 'DELETE', `/expenses/${expenseId}`);

  // 13. Dashboard APIs
  await request('Occupancy, revenue, dues and key KPIs', 'GET', '/dashboard/overview');
  await request('Revenue trend/summary', 'GET', '/dashboard/revenue');
  await request('Occupancy trend/summary', 'GET', '/dashboard/occupancy');

  // 14. Monthly Closure API
  await request('Complete month-end processing', 'POST', '/monthly/close');

  // Deletions at the end to clean up
  await request('Checkout tenant and start settlement', 'PUT', `/tenants/${tenantId}/checkout`);
  await request('Delete tenant', 'DELETE', `/tenants/${tenantId}`);
  await request('Delete bed', 'DELETE', `/beds/${bedId}`);
  await request('Delete room', 'DELETE', `/rooms/${roomId}`);
  await request('Delete floor', 'DELETE', `/floors/${floorId}`);
  await request('Delete a hostel', 'DELETE', `/hostels/${hostelId}`);
  await request('Invalidate/logout current session', 'POST', '/auth/logout');

  log('--- ALL TESTS COMPLETED ---\n');
  fs.writeFileSync('../tavyn_api_test_results.txt', logs.join('\n'));
  console.log('Results saved to tavyn_api_test_results.txt');
}

runAllTests();
