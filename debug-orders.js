const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.join(__dirname, '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Error loading .env file:', result.error);
  process.exit(1);
}

console.log('✅ Environment loaded');
console.log('MONGODB_URI exists?', !!process.env.MONGODB_URI);
console.log('MONGO_URI exists?', !!process.env.MONGO_URI);

const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');

const debugOrders = async () => {
  try {
    // Use whichever variable exists
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ Neither MONGODB_URI nor MONGO_URI found in environment variables');
      process.exit(1);
    }

    // Connect to MongoDB
    console.log('\n🔌 Connecting to MongoDB...');
    console.log('Using connection string:', mongoUri.replace(/\/\/.*:.*@/, '//***:***@')); // Hide password
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get one order
    console.log('\n========================================');
    console.log('1️⃣ FETCHING RAW ORDER (NO POPULATE)');
    console.log('========================================');
    const rawOrder = await Order.findOne().lean();
    if (rawOrder) {
      console.log('Order ID:', rawOrder._id);
      console.log('Order Number:', rawOrder.orderNumber);
      console.log('User field (raw):', rawOrder.user);
      console.log('User field type:', typeof rawOrder.user);
      console.log('Driver field (raw):', rawOrder.driver);
      console.log('Restaurant field (raw):', rawOrder.restaurant);
    } else {
      console.log('❌ No orders found in database');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Check if user exists
    console.log('\n========================================');
    console.log('2️⃣ CHECKING IF USER EXISTS');
    console.log('========================================');
    if (rawOrder.user) {
      const userExists = await User.findById(rawOrder.user);
      if (userExists) {
        console.log('✅ User EXISTS in database');
        console.log('User ID:', userExists._id);
        console.log('User Name:', userExists.name);
        console.log('User Email:', userExists.email);
        console.log('User Type:', userExists.userType);
      } else {
        console.log('❌ User DOES NOT EXIST in database');
        console.log('The user ID in order:', rawOrder.user);
        console.log('⚠️ THIS IS THE PROBLEM - The order references a user that doesn\'t exist!');
      }
    }

    // Try to populate
    console.log('\n========================================');
    console.log('3️⃣ FETCHING ORDER WITH POPULATE');
    console.log('========================================');
    const populatedOrder = await Order.findById(rawOrder._id)
      .populate('user', 'name email phone')
      .lean();
    
    console.log('User field (populated):', JSON.stringify(populatedOrder.user, null, 2));
    console.log('User field type:', typeof populatedOrder.user);
    
    if (populatedOrder.user && typeof populatedOrder.user === 'object' && populatedOrder.user.name) {
      console.log('✅ Population SUCCESSFUL');
      console.log('User Name:', populatedOrder.user.name);
      console.log('User Email:', populatedOrder.user.email);
    } else {
      console.log('❌ Population FAILED');
      console.log('User is still just an ID or null');
    }

    // Check all users
    console.log('\n========================================');
    console.log('4️⃣ ALL USERS IN DATABASE');
    console.log('========================================');
    const allUsers = await User.find().select('_id name email userType').lean();
    console.log(`Total users: ${allUsers.length}`);
    if (allUsers.length === 0) {
      console.log('⚠️ No users found in database!');
    } else {
      allUsers.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.name} (${user.email}) - Type: ${user.userType} - ID: ${user._id}`);
      });
    }

    // Check all orders
    console.log('\n========================================');
    console.log('5️⃣ ALL ORDERS IN DATABASE');
    console.log('========================================');
    const allOrders = await Order.find().select('_id orderNumber user').lean();
    console.log(`Total orders: ${allOrders.length}`);
    allOrders.forEach((order, idx) => {
      console.log(`${idx + 1}. ${order.orderNumber} - User ID: ${order.user}`);
    });

    // Compare user IDs
    console.log('\n========================================');
    console.log('6️⃣ CHECKING ID MATCHES');
    console.log('========================================');
    const orderUserIds = allOrders.map(o => o.user?.toString()).filter(Boolean);
    const userIds = allUsers.map(u => u._id.toString());
    
    console.log('Order user IDs:', orderUserIds);
    console.log('Available user IDs:', userIds);
    
    const orphanedOrders = orderUserIds.filter(orderId => !userIds.includes(orderId));
    if (orphanedOrders.length > 0) {
      console.log('\n⚠️⚠️⚠️ ORPHANED ORDERS FOUND! ⚠️⚠️⚠️');
      console.log('These orders reference users that don\'t exist:');
      orphanedOrders.forEach(id => console.log(`  - ${id}`));
      console.log('\n💡 SOLUTION: You need to either:');
      console.log('  1. Delete these orphaned orders, OR');
      console.log('  2. Update them with valid user IDs');
    } else {
      console.log('✅ All orders reference valid users');
    }

    // Try explicit populate with model
    console.log('\n========================================');
    console.log('7️⃣ TRYING POPULATE WITH EXPLICIT MODEL');
    console.log('========================================');
    const explicitPopulate = await Order.findById(rawOrder._id)
      .populate({
        path: 'user',
        model: 'User',
        select: 'name email phone'
      })
      .lean();
    
    console.log('User field:', JSON.stringify(explicitPopulate.user, null, 2));
    if (explicitPopulate.user && typeof explicitPopulate.user === 'object' && explicitPopulate.user.name) {
      console.log('✅ Explicit model populate WORKED');
      console.log('User Name:', explicitPopulate.user.name);
    } else {
      console.log('❌ Explicit model populate FAILED');
    }

    console.log('\n========================================');
    console.log('✅ DEBUG COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Debug Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
};

debugOrders();