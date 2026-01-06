// backupMenu.js
// Script to backup menu items for "Deliver Now Store"
// Run: node backupMenu.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/food-delivery';

// Menu Item Schema (simplified)
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

// Restaurant Schema (simplified)
const restaurantSchema = new mongoose.Schema({
  name: String
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function backupMenu() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Deliver Now Store
    const restaurant = await Restaurant.findOne({ 
      name: /Deliver Now Store/i 
    });

    if (!restaurant) {
      console.log('❌ Restaurant "Deliver Now Store" not found!');
      console.log('\n📋 Available restaurants:');
      const allRestaurants = await Restaurant.find({}, 'name').limit(20);
      allRestaurants.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name} (ID: ${r._id})`);
      });
      process.exit(1);
    }

    console.log('✅ Found restaurant:', restaurant.name);
    console.log('🆔 Restaurant ID:', restaurant._id);
    console.log('');

    // Find all menu items for this restaurant
    const menuItems = await MenuItem.find({ 
      restaurant: restaurant._id 
    });

    console.log(`📋 Found ${menuItems.length} menu items\n`);

    if (menuItems.length === 0) {
      console.log('⚠️  No menu items found for this restaurant');
      process.exit(0);
    }

    // Display menu items
    console.log('📝 Menu Items:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    menuItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}`);
      console.log(`   Category: ${item.category || 'None'}`);
      console.log(`   Price: R${item.price || 0}`);
      console.log(`   Available: ${item.isAvailable !== false ? '✅' : '❌'}`);
      console.log('');
    });

    // Prepare backup data
    const backupData = {
      restaurant: {
        name: restaurant.name,
        oldId: restaurant._id.toString(),
        backedUpAt: new Date().toISOString()
      },
      menuItems: menuItems.map(item => ({
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        image: item.image,
        isAvailable: item.isAvailable,
        ingredients: item.ingredients,
        preparationTime: item.preparationTime,
        calories: item.calories,
        tags: item.tags,
        // Don't include restaurant ID - will be set during restore
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    };

    // Save to file
    const timestamp = Date.now();
    const filename = `deliver-now-menu-backup-${timestamp}.json`;
    const filepath = path.join(__dirname, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Backup completed successfully!\n');
    console.log('📁 Backup file:', filename);
    console.log('📍 Location:', filepath);
    console.log('📊 Total items backed up:', menuItems.length);
    console.log('');
    console.log('💡 To restore after creating new restaurant:');
    console.log(`   node restoreMenu.js ${filename} NEW_RESTAURANT_ID`);
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

backupMenu();