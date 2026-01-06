const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const { 
  authMiddleware,
  optionalAuth
} = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Helper functions
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'restaurants',
        transformation: [{ width: 800, height: 600, crop: 'fill' }],
        invalidate: true,
        overwrite: true,
        resource_type: 'auto',
        public_id: `restaurants/restaurant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload successful:', result.secure_url);
          resolve(result);
        }
      }
    );
    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
};

const deleteFromCloudinary = async (imageUrl) => {
  if (!imageUrl) return;
  
  try {
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1].split('.')[0];
    const folder = urlParts[urlParts.length - 2];
    const publicId = `${folder}/${filename}`;
    
    console.log('🗑️ Deleting from Cloudinary:', publicId);
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    console.log('✅ Deletion result:', result);
    return result;
  } catch (error) {
    console.error('⚠️ Error deleting:', error.message);
    return null;
  }
};

// 🔍 DEBUG ROUTE - Check database contents
router.get('/debug/all', async (req, res) => {
  try {
    const allRestaurants = await Restaurant.find({})
      .select('name isActive status cuisine')
      .lean();

    const stats = {
      total: allRestaurants.length,
      active: allRestaurants.filter(r => r.isActive).length,
      inactive: allRestaurants.filter(r => !r.isActive).length,
      open: allRestaurants.filter(r => r.status === 'open').length,
      closed: allRestaurants.filter(r => r.status === 'closed').length,
    };

    console.log('🔍 Database Stats:', stats);
    console.log('📋 All restaurants:', allRestaurants.map(r => `${r.name} (Active: ${r.isActive}, Status: ${r.status})`));

    res.json({
      success: true,
      stats,
      restaurants: allRestaurants
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔥 ACTIVATE ALL RESTAURANTS
router.patch('/activate-all', async (req, res) => {
  try {
    console.log('🔄 Activating all restaurants...');

    const result = await Restaurant.updateMany(
      {},
      { $set: { isActive: true, status: 'open' } }
    );

    const restaurants = await Restaurant.find({}, 'name isActive status');

    console.log(`✅ Activated ${result.modifiedCount} restaurants`);
    console.log('📋 All restaurants:');
    restaurants.forEach(r => {
      console.log(`   - ${r.name}: ${r.isActive ? '✅ Active' : '❌ Inactive'} (${r.status})`);
    });

    res.json({
      success: true,
      message: `All ${restaurants.length} restaurants activated!`,
      data: {
        updated: result.modifiedCount,
        total: restaurants.length,
        restaurants: restaurants.map(r => ({
          name: r.name,
          isActive: r.isActive,
          status: r.status
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate restaurants',
      error: error.message
    });
  }
});

// ✅ PUBLIC ROUTE - Get all restaurants
router.get('/', optionalAuth, async (req, res) => {
  try {
    // 🔥 Increased default limit from 10 to 100
    const { page = 1, limit = 100, search, status, isActive } = req.query;
    
    console.log('📋 Fetching restaurants...');
    console.log('📦 Query params:', { page, limit, search, status, isActive });
    
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { cuisine: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    // Only filter by isActive if explicitly provided
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const restaurants = await Restaurant.find(query)
      .populate('vendor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Restaurant.countDocuments(query);

    console.log(`✅ Found ${restaurants.length} restaurants (total: ${total})`);
    console.log('📋 Restaurant names:', restaurants.map(r => r.name));

    const restaurantsWithCacheBuster = restaurants.map(r => {
      const restaurant = r.toObject();
      if (restaurant.image) {
        restaurant.image = `${restaurant.image}?t=${Date.now()}`;
      }
      if (restaurant.coverImage) {
        restaurant.coverImage = `${restaurant.coverImage}?t=${Date.now()}`;
      }
      return restaurant;
    });

    res.json({
      success: true,
      data: restaurantsWithCacheBuster,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching restaurants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurants',
      error: error.message
    });
  }
});

// ✅ PUBLIC ROUTE - Get single restaurant
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id)
      .populate('vendor', 'name email');
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const restaurantObj = restaurant.toObject();
    if (restaurantObj.image) {
      restaurantObj.image = `${restaurantObj.image}?t=${Date.now()}`;
    }
    if (restaurantObj.coverImage) {
      restaurantObj.coverImage = `${restaurantObj.coverImage}?t=${Date.now()}`;
    }

    res.json({
      success: true,
      data: restaurantObj
    });

  } catch (error) {
    console.error('❌ Error fetching restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant',
      error: error.message
    });
  }
});

// ✅ ADMIN ONLY - Create new restaurant
router.post('/', authMiddleware, upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('📥 Creating restaurant');

    const {
      name,
      description,
      cuisine,
      vendorEmail,
      vendorName,
      vendorPhone,
      vendorPassword,
      contactPhone,
      contactEmail,
      street,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      deliveryFee,
      minimumOrder
    } = req.body;

    if (!name || !vendorEmail || !vendorName) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant name, vendor email, and vendor name are required'
      });
    }

    let vendor = await User.findOne({ email: vendorEmail });
    
    if (!vendor) {
      vendor = new User({
        name: vendorName || name,
        email: vendorEmail,
        phone: vendorPhone || '+27000000000',
        password: vendorPassword || 'vendor123',
        userType: 'vendor'
      });
      await vendor.save();
      console.log('✅ New vendor created:', vendorEmail);
    }

    let profileImageUrl = null;
    let coverImageUrl = null;

    if (req.files) {
      if (req.files['profileImage']) {
        const profileFile = req.files['profileImage'][0];
        console.log('📤 Uploading profile image...');
        const profileResult = await uploadToCloudinary(profileFile.buffer);
        profileImageUrl = profileResult.secure_url;
      }

      if (req.files['coverImage']) {
        const coverFile = req.files['coverImage'][0];
        console.log('📤 Uploading cover image...');
        const coverResult = await uploadToCloudinary(coverFile.buffer);
        coverImageUrl = coverResult.secure_url;
      }
    }

    const restaurant = new Restaurant({
      name,
      description: description || '',
      cuisine: cuisine || 'General',
      vendor: vendor._id,
      image: profileImageUrl,
      coverImage: coverImageUrl,
      contact: {
        phone: contactPhone || vendorPhone || '+27000000000',
        email: contactEmail || vendorEmail
      },
      address: {
        street: street || '',
        city: city || '',
        state: state || '',
        zipCode: zipCode || '',
        coordinates: {
          latitude: parseFloat(latitude) || -26.2041,
          longitude: parseFloat(longitude) || 28.0473
        }
      },
      deliveryFee: parseFloat(deliveryFee) || 0,
      minimumOrder: parseFloat(minimumOrder) || 0,
      isActive: true,
      status: 'open'
    });

    await restaurant.save();
    await restaurant.populate('vendor', 'name email');
    
    console.log('✅ Restaurant created successfully:', restaurant.name);

    res.status(201).json({
      success: true,
      message: 'Restaurant created successfully',
      data: restaurant
    });

  } catch (error) {
    console.error('❌ Error creating restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create restaurant',
      error: error.message
    });
  }
});

// ✅ ADMIN ONLY - Update restaurant
router.put('/:id', authMiddleware, upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('📥 Updating restaurant:', req.params.id);
    console.log('📦 Request body:', req.body);

    const {
      name,
      description,
      cuisine,
      phone,
      email,
      street,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      deliveryFee,
      minimumOrder
    } = req.body;

    const restaurant = await Restaurant.findById(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const oldProfileImage = restaurant.image;
    const oldCoverImage = restaurant.coverImage;

    if (name) restaurant.name = name;
    if (description !== undefined) restaurant.description = description;
    if (cuisine) restaurant.cuisine = cuisine;
    if (deliveryFee !== undefined) restaurant.deliveryFee = parseFloat(deliveryFee);
    if (minimumOrder !== undefined) restaurant.minimumOrder = parseFloat(minimumOrder);

    if (phone || email) {
      restaurant.contact = {
        phone: phone || restaurant.contact?.phone || '',
        email: email || restaurant.contact?.email || ''
      };
    }

    if (street || city || state || zipCode || latitude || longitude) {
      restaurant.address = {
        street: street || restaurant.address?.street || '',
        city: city || restaurant.address?.city || '',
        state: state || restaurant.address?.state || '',
        zipCode: zipCode || restaurant.address?.zipCode || '',
        coordinates: {
          latitude: latitude ? parseFloat(latitude) : (restaurant.address?.coordinates?.latitude || -26.2041),
          longitude: longitude ? parseFloat(longitude) : (restaurant.address?.coordinates?.longitude || 28.0473)
        }
      };
    }

    if (req.files && req.files['profileImage']) {
      const profileFile = req.files['profileImage'][0];
      console.log('📤 Uploading NEW profile image...');
      
      const profileResult = await uploadToCloudinary(profileFile.buffer);
      restaurant.image = profileResult.secure_url;
      console.log('✅ New profile image uploaded:', restaurant.image);
      
      if (oldProfileImage) {
        await deleteFromCloudinary(oldProfileImage);
      }
    }

    if (req.files && req.files['coverImage']) {
      const coverFile = req.files['coverImage'][0];
      console.log('📤 Uploading NEW cover image...');
      
      const coverResult = await uploadToCloudinary(coverFile.buffer);
      restaurant.coverImage = coverResult.secure_url;
      console.log('✅ New cover image uploaded:', restaurant.coverImage);
      
      if (oldCoverImage) {
        await deleteFromCloudinary(oldCoverImage);
      }
    }

    await restaurant.save({ validateBeforeSave: false });
    await restaurant.populate('vendor', 'name email');

    console.log('✅ Restaurant updated successfully:', restaurant.name);

    res.json({
      success: true,
      message: 'Restaurant updated successfully',
      data: restaurant
    });

  } catch (error) {
    console.error('❌ Error updating restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update restaurant',
      error: error.message
    });
  }
});

// ✅ ADMIN ONLY - Toggle restaurant active status
router.patch('/:id/toggle-status', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 Toggling restaurant status:', req.params.id);
    
    const restaurant = await Restaurant.findById(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    restaurant.isActive = !restaurant.isActive;
    await restaurant.save({ validateBeforeSave: false });

    console.log(`✅ Restaurant "${restaurant.name}" is now ${restaurant.isActive ? 'ACTIVE' : 'INACTIVE'}`);

    res.json({
      success: true,
      message: `Restaurant ${restaurant.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        _id: restaurant._id,
        name: restaurant.name,
        isActive: restaurant.isActive
      }
    });

  } catch (error) {
    console.error('❌ Error toggling restaurant status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle status',
      error: error.message
    });
  }
});

// ✅ ADMIN ONLY - Delete restaurant
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('🗑️ Deleting restaurant:', req.params.id);
    
    const restaurant = await Restaurant.findById(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    if (restaurant.image) {
      await deleteFromCloudinary(restaurant.image);
    }
    if (restaurant.coverImage) {
      await deleteFromCloudinary(restaurant.coverImage);
    }

    await Restaurant.findByIdAndDelete(req.params.id);
    console.log('✅ Restaurant deleted:', restaurant.name);

    res.json({
      success: true,
      message: 'Restaurant deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete restaurant',
      error: error.message
    });
  }
});

module.exports = router;
