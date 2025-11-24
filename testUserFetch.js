// testUserFetch.js - Test script to fetch user names
// Run with: node testUserFetch.js

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔗 Connecting to MongoDB...');

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    // Define User schema (simple version)
    const userSchema = new mongoose.Schema({
      name: String,
      email: String,
      phone: String,
      userType: String
    }, { collection: 'users' });

    const User = mongoose.model('User', userSchema);

    // Test 1: Fetch all users
    console.log('📋 TEST 1: Fetching all users...');
    const allUsers = await User.find().limit(5).lean();
    console.log(`Found ${allUsers.length} users:`);
    allUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - Type: ${user.userType}`);
    });

    // Test 2: Fetch specific user by ID
    const testUserId = '68d15f13f5032ff0680bb039'; // From your order
    console.log(`\n📋 TEST 2: Fetching user by ID: ${testUserId}`);
    const specificUser = await User.findById(testUserId).lean();
    if (specificUser) {
      console.log('✅ User found:');
      console.log(`   Name: ${specificUser.name}`);
      console.log(`   Email: ${specificUser.email}`);
      console.log(`   Phone: ${specificUser.phone}`);
      console.log(`   Type: ${specificUser.userType}`);
    } else {
      console.log('❌ User not found with this ID');
    }

    // Test 3: Fetch order and its user
    console.log('\n📋 TEST 3: Fetching order with user data...');
    
    const orderSchema = new mongoose.Schema({
      orderNumber: String,
      user: mongoose.Schema.Types.ObjectId,
      restaurant: mongoose.Schema.Types.ObjectId,
      status: String
    }, { collection: 'orders' });

    const Order = mongoose.model('Order', orderSchema);

    const testOrder = await Order.findOne().lean();
    if (testOrder) {
      console.log(`Order: ${testOrder.orderNumber}`);
      console.log(`User ID: ${testOrder.user}`);
      
      // Fetch the user
      const orderUser = await User.findById(testOrder.user).lean();
      if (orderUser) {
        console.log('✅ User fetched successfully:');
        console.log(`   Name: ${orderUser.name}`);
        console.log(`   Email: ${orderUser.email}`);
      } else {
        console.log('❌ Could not fetch user for this order');
      }
    }

    console.log('\n✅ All tests complete!');
    mongoose.disconnect();
    process.exit(0);

  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });