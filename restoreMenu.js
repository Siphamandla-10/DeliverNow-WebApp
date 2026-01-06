// restoreMenu.js
// Script to restore menu items to a new restaurant
// Run: node restoreMenu.js backup-file.json NEW_RESTAURANT_ID

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/food-delivery';

// Menu Item Schema
const menuItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  restaurant: mongoose.Schema.Types.ObjectId,
  isAvailable: Boolean,
  ingredients: [String],
  preparationTime: Number,
  calories: Number,
  tags: [String]
}, { timestamps: true });

const MenuItem = mongoose.model('MenuItem', menuItemSchema);

// Restaurant Schema
const restaurantSchema = new mongoose.Schema({
  name: String
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function restoreMenu(backupFile, restaurantId) {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Read backup file
    console.log('📂 Reading backup file:', backupFile);
    const filepath = path.join(__dirname, backupFile);
    
    if (!fs.existsSync(filepath)) {
      console.error('❌ Backup file not found:', filepath);
      process.exit(1);
    }

    const backupData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    console.log('✅ Backup file loaded');
    console.log('📋 Original restaurant:', backupData.restaurant.name);
    console.log('📅 Backed up at:', backupData.restaurant.backedUpAt);
    console.log('📊 Menu items in backup:', backupData.menuItems.length);
    console.log('');

    // Verify new restaurant exists
    let restaurant;
    if (restaurantId) {
      restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        console.error('❌ Restaurant not found with ID:', restaurantId);
        process.exit(1);
      }
    } else {
      // Find by name
      restaurant = await Restaurant.findOne({ name: /Deliver Now Store/i });
      if (!restaurant) {
        console.error('❌ No restaurant found with name "Deliver Now Store"');
        console.log('\n💡 Please provide restaurant ID:');
        console.log('   node restoreMenu.js backup-file.json RESTAURANT_ID');
        
        console.log('\n📋 Available restaurants:');
        const allRestaurants = await Restaurant.find({}, 'name').limit(10);
        allRestaurants.forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.name} (ID: ${r._id})`);
        });
        process.exit(1);
      }
    }

    console.log('✅ Target restaurant found:', restaurant.name);
    console.log('🆔 Restaurant ID:', restaurant._id);
    console.log('');

    // Check if restaurant already has menu items
    const existingItems = await MenuItem.countDocuments({ restaurant: restaurant._id });
    if (existingItems > 0) {
      console.log(`⚠️  Restaurant already has ${existingItems} menu items`);
      console.log('');
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise((resolve) => {
        readline.question('Do you want to DELETE existing items and restore? (yes/no): ', (answer) => {
          readline.close();
          if (answer.toLowerCase() !== 'yes') {
            console.log('❌ Restore cancelled');
            process.exit(0);
          }
          resolve();
        });
      });

      // Delete existing items
      console.log('🗑️  Deleting existing menu items...');
      await MenuItem.deleteMany({ restaurant: restaurant._id });
      console.log('✅ Existing items deleted\n');
    }

    // Restore menu items
    console.log('📥 Restoring menu items...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let successCount = 0;
    let errorCount = 0;

    for (const itemData of backupData.menuItems) {
      try {
        const newItem = new MenuItem({
          ...itemData,
          restaurant: restaurant._id  // Set new restaurant ID
        });
        
        await newItem.save();
        console.log(`✅ ${successCount + 1}. ${itemData.name} - R${itemData.price}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to restore: ${itemData.name} - ${error.message}`);
        errorCount++;
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🎉 Restore completed!');
    console.log(`✅ Successfully restored: ${successCount} items`);
    if (errorCount > 0) {
      console.log(`❌ Failed to restore: ${errorCount} items`);
    }
    console.log('');
    console.log('📊 Restaurant now has', await MenuItem.countDocuments({ restaurant: restaurant._id }), 'menu items');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Get command line arguments
const backupFile = process.argv[2];
const restaurantId = process.argv[3];

if (!backupFile) {
  console.log('❌ Usage: node restoreMenu.js <backup-file.json> [restaurant-id]');
  console.log('');
  console.log('Examples:');
  console.log('   node restoreMenu.js deliver-now-menu-backup-1234567890.json');
  console.log('   node restoreMenu.js deliver-now-menu-backup-1234567890.json 68c8682969a704433e2b56f7');
  console.log('');
  process.exit(1);
}

restoreMenu(backupFile, restaurantId);