// fix-admin-role.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0";

async function fixAdminRole() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the collection directly (bypasses Mongoose schema)
    const db = mongoose.connection.db;
    const adminsCollection = db.collection('admins');

    // First, show current admin
    console.log('📊 Current admin data:');
    const currentAdmin = await adminsCollection.findOne({ email: '202119467@spu.ac.za' });
    console.log(JSON.stringify(currentAdmin, null, 2));
    console.log('');

    // Update the admin with role field
    console.log('🔄 Updating admin with role field...');
    const result = await adminsCollection.updateOne(
      { email: '202119467@spu.ac.za' },
      { 
        $set: { 
          role: 'admin',
          name: 'Mbuyiseni',
          surname: 'Khumalo'
        } 
      }
    );

    console.log('✅ Update result:', {
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
    console.log('');

    // Verify the update
    console.log('📊 Updated admin data:');
    const updatedAdmin = await adminsCollection.findOne({ email: '202119467@spu.ac.za' });
    console.log(JSON.stringify(updatedAdmin, null, 2));
    console.log('');

    // Update all other admins too
    console.log('🔄 Updating other admins...');
    const bulkResult = await adminsCollection.updateMany(
      { role: { $exists: false } },
      { $set: { role: 'admin' } }
    );
    
    console.log('✅ Bulk update result:', {
      matched: bulkResult.matchedCount,
      modified: bulkResult.modifiedCount
    });
    console.log('');

    // Show all admins
    console.log('📋 All admins in database:');
    const allAdmins = await adminsCollection.find({}).toArray();
    allAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name || 'N/A'} ${admin.surname || ''} (${admin.email}) - Role: ${admin.role || 'MISSING'}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done! Your admin now has the role field.');
    console.log('\n🎯 You can now login at: https://front-end-lake-one.vercel.app/login');
    console.log('📧 Email: 202119467@spu.ac.za');
    console.log('🔑 Password: (your password)');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAdminRole();