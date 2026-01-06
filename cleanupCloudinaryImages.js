// cleanupCloudinaryImages.js
// Script to delete old/unused restaurant images from Cloudinary
// Run: node cleanupCloudinaryImages.js

const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/food-delivery';

// Restaurant Schema
const restaurantSchema = new mongoose.Schema({
  name: String,
  image: String,
  coverImage: String
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function cleanupCloudinaryImages() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('☁️  Connecting to Cloudinary...');
    console.log('📁 Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('');

    // Get all images from Cloudinary restaurants folder
    console.log('📥 Fetching images from Cloudinary...');
    const cloudinaryImages = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'restaurants/',
      max_results: 500
    });

    console.log(`✅ Found ${cloudinaryImages.resources.length} images in Cloudinary\n`);

    // Get all restaurant images from database
    console.log('📥 Fetching restaurants from database...');
    const restaurants = await Restaurant.find({}, 'name image coverImage');
    console.log(`✅ Found ${restaurants.length} restaurants in database\n`);

    // Extract all image URLs from database
    const usedImageUrls = new Set();
    restaurants.forEach(restaurant => {
      if (restaurant.image) {
        usedImageUrls.add(restaurant.image);
      }
      if (restaurant.coverImage) {
        usedImageUrls.add(restaurant.coverImage);
      }
    });

    console.log(`📊 Total images in use: ${usedImageUrls.size}\n`);

    // Find unused images
    console.log('🔍 Comparing Cloudinary images with database...\n');
    const unusedImages = [];
    
    for (const resource of cloudinaryImages.resources) {
      const isUsed = Array.from(usedImageUrls).some(url => 
        url.includes(resource.public_id)
      );
      
      if (!isUsed) {
        unusedImages.push(resource);
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`☁️  Total images in Cloudinary: ${cloudinaryImages.resources.length}`);
    console.log(`📦 Images in use by restaurants: ${usedImageUrls.size}`);
    console.log(`🗑️  Unused images found: ${unusedImages.length}`);
    console.log('');

    if (unusedImages.length === 0) {
      console.log('✅ No unused images found! Cloudinary is clean.');
      console.log('');
      process.exit(0);
    }

    // Display unused images
    console.log('🗑️  UNUSED IMAGES:');
    console.log('─────────────────────────────────────────────────────');
    unusedImages.forEach((image, index) => {
      console.log(`${index + 1}. ${image.public_id}`);
      console.log(`   URL: ${image.secure_url}`);
      console.log(`   Size: ${(image.bytes / 1024).toFixed(2)} KB`);
      console.log(`   Created: ${image.created_at}`);
      console.log('');
    });

    // Calculate total size
    const totalSize = unusedImages.reduce((sum, img) => sum + img.bytes, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`💾 Total size of unused images: ${totalSizeMB} MB`);
    console.log('');

    // Confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      readline.question(`Delete ${unusedImages.length} unused images? Type "DELETE" to confirm: `, (answer) => {
        readline.close();
        if (answer !== 'DELETE') {
          console.log('');
          console.log('❌ Cleanup cancelled - no images were deleted');
          process.exit(0);
        }
        resolve();
      });
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🗑️  DELETING UNUSED IMAGES');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (const image of unusedImages) {
      try {
        console.log(`🗑️  Deleting: ${image.public_id}...`);
        const result = await cloudinary.uploader.destroy(image.public_id, {
          invalidate: true
        });
        
        if (result.result === 'ok') {
          console.log(`   ✅ Deleted successfully`);
          successCount++;
        } else {
          console.log(`   ⚠️  Result: ${result.result}`);
          errorCount++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 CLEANUP COMPLETED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`✅ Successfully deleted: ${successCount} images`);
    if (errorCount > 0) {
      console.log(`❌ Failed to delete: ${errorCount} images`);
    }
    console.log(`💾 Space freed: ~${totalSizeMB} MB`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    if (error.error && error.error.message) {
      console.error('Details:', error.error.message);
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

cleanupCloudinaryImages();