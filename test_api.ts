import {  } from 'ofetch';

async function main() {
  const baseURL = 'http://localhost:5667/api'; // Assuming default port
  
  console.log('--- Testing without ignoreYearFilter (Default) ---');
  try {
    const res1 = await (baseURL + '/qms/work-order?pageSize=5');
    console.log('Items count:', res1.items.length);
    if (res1.items.length > 0) {
      console.log('First item year:', res1.items[0].deliveryDate);
    }
  } catch (e) {
    console.error('Error fetching default:', e);
  }

  console.log('\n--- Testing WITH ignoreYearFilter=true ---');
  try {
    const res2 = await (baseURL + '/qms/work-order?pageSize=5&ignoreYearFilter=true');
    console.log('Items count:', res2.items.length);
    if (res2.items.length > 0) {
       console.log('First item year:', res2.items[0].deliveryDate);
    }
  } catch (e) {
    console.error('Error fetching with ignoreYearFilter:', e);
  }
}

main();
