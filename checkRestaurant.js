// checkRestaurant.js
// Quick script to check current restaurant data
// Run: node checkRestaurant.js

const mongoose = require('mongoose');
require('dotenv').config();

const restaurantSchema = new mongoose.Schema({
  name: String,
  image: String,
  coverImage: String,
  description: String,
  cuisine: String
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function checkRestaurant() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const restaurant = await Restaurant.findOne({ 
      name: /Deliver Now Store/i 
    });

    if (!restaurant) {
      console.log('❌ Restaurant not found');
      process.exit(1);
    }

    console.log('📊 CURRENT RESTAURANT DATA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏪 Name:', restaurant.name);
    console.log('🆔 ID:', restaurant._id);
    console.log('📝 Description:', restaurant.description);
    console.log('🍽️  Cuisine:', restaurant.cuisine);
    console.log('\n📸 PROFILE IMAGE:');
    console.log(restaurant.image || '❌ No profile image');
    console.log('\n🖼️  COVER IMAGE:');
    console.log(restaurant.coverImage || '❌ No cover image');
    console.log('\n⏰ Updated At:', restaurant.updatedAt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Extract Cloudinary public IDs
    if (restaurant.image) {
      const profileId = restaurant.image.split('/').slice(-2).join('/').split('.')[0];
      console.log('🔑 Profile Image Public ID:', profileId);
    }
    if (restaurant.coverImage) {
      const coverId = restaurant.coverImage.split('/').slice(-2).join('/').split('.')[0];
      console.log('🔑 Cover Image Public ID:', coverId);
    }

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkRestaurant();