// checkMenuImages.js
// Script to see what images your menu items are using
// Run: node checkMenuImages.js

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/food-delivery';

const menuItemSchema = new mongoose.Schema({
  name: String,
  image: String,
  restaurant: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const restaurantSchema = new mongoose.Schema({
  name: String
}, { timestamps: true });

const MenuItem = mongoose.model('MenuItem', menuItemSchema);
const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function checkMenuImages() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Find Deliver Now Store
    const restaurant = await Restaurant.findOne({ name: /Deliver Now Store/i });
    
    if (!restaurant) {
      console.log('❌ Restaurant not found');
      process.exit(1);
    }

    console.log('✅ Found:', restaurant.name);
    console.log('🆔 ID:', restaurant._id);
    console.log('');

    // Get menu items
    const menuItems = await MenuItem.find({ restaurant: restaurant._id });
    
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📋 MENU ITEMS (${menuItems.length} total)`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    menuItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}`);
      if (item.image) {
        console.log(`   📸 Image: ${item.image}`);
      } else {
        console.log('   📸 No image');
      }
      console.log('');
    });

    // Count items with images
    const itemsWithImages = menuItems.filter(item => item.image);
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Summary:`);
    console.log(`   Total items: ${menuItems.length}`);
    console.log(`   Items with images: ${itemsWithImages.length}`);
    console.log(`   Items without images: ${menuItems.length - itemsWithImages.length}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkMenuImages();