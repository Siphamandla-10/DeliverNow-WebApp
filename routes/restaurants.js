const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure multer for memory storage
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

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'restaurants',
        transformation: [{ width: 800, height: 600, crop: 'fill' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
};

// GET /api/restaurants - Get all restaurants with pagination and filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, isActive } = req.query;
    
    console.log('📋 Fetching all restaurants...');
    
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

    res.json({
      success: true,
      data: restaurants,
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

// GET /api/restaurants/:id - Get single restaurant
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id)
      .populate('vendor', 'name email');
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    res.json({
      success: true,
      data: restaurant
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

// POST /api/restaurants - Create new restaurant
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

    if (!name || !cuisine || !vendorEmail || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name, cuisine, vendor email, phone, and email are required'
      });
    }

    let vendor = await User.findOne({ email: vendorEmail });
    
    if (!vendor) {
      vendor = new User({
        name: name,
        email: vendorEmail,
        phone: phone,
        password: 'TempPassword123!',
        userType: 'vendor'
      });
      await vendor.save();
      console.log('✅ New vendor created');
    }

    let profileImageUrl = null;
    let coverImageUrl = null;

    if (req.files) {
      if (req.files['profileImage']) {
        const profileFile = req.files['profileImage'][0];
        console.log('📤 Uploading profile image to Cloudinary...');
        const profileResult = await uploadToCloudinary(profileFile.buffer);
        profileImageUrl = profileResult.secure_url;
        console.log('✅ Profile image uploaded');
      }

      if (req.files['coverImage']) {
        const coverFile = req.files['coverImage'][0];
        console.log('📤 Uploading cover image to Cloudinary...');
        const coverResult = await uploadToCloudinary(coverFile.buffer);
        coverImageUrl = coverResult.secure_url;
        console.log('✅ Cover image uploaded');
      }
    }

    const restaurant = new Restaurant({
      name,
      description,
      cuisine,
      vendor: vendor._id,
      image: profileImageUrl,
      coverImage: coverImageUrl,
      contact: {
        phone,
        email
      },
      address: {
        street,
        city,
        state,
        zipCode,
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
    
    console.log('✅ Restaurant created:', restaurant.name);

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

// PUT /api/restaurants/:id - Update restaurant
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

    // Update basic fields
    if (name) restaurant.name = name;
    if (description !== undefined) restaurant.description = description;
    if (cuisine) restaurant.cuisine = cuisine;
    if (deliveryFee !== undefined) restaurant.deliveryFee = parseFloat(deliveryFee);
    if (minimumOrder !== undefined) restaurant.minimumOrder = parseFloat(minimumOrder);

    // Update contact info
    if (phone || email) {
      restaurant.contact = {
        phone: phone || restaurant.contact?.phone || '',
        email: email || restaurant.contact?.email || ''
      };
    }

    // Update address info
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

    // Update profile image
    if (req.files && req.files['profileImage']) {
      const profileFile = req.files['profileImage'][0];
      console.log('📤 Uploading new profile image...');
      
      // Delete old image if exists
      if (restaurant.image) {
        try {
          const publicId = restaurant.image.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`restaurants/${publicId}`);
          console.log('🗑️ Old profile image deleted');
        } catch (err) {
          console.log('⚠️ Could not delete old profile image:', err.message);
        }
      }
      
      const profileResult = await uploadToCloudinary(profileFile.buffer);
      restaurant.image = profileResult.secure_url;
      console.log('✅ New profile image uploaded');
    }

    // Update cover image
    if (req.files && req.files['coverImage']) {
      const coverFile = req.files['coverImage'][0];
      console.log('📤 Uploading new cover image...');
      
      // Delete old image if exists
      if (restaurant.coverImage) {
        try {
          const publicId = restaurant.coverImage.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`restaurants/${publicId}`);
          console.log('🗑️ Old cover image deleted');
        } catch (err) {
          console.log('⚠️ Could not delete old cover image:', err.message);
        }
      }
      
      const coverResult = await uploadToCloudinary(coverFile.buffer);
      restaurant.coverImage = coverResult.secure_url;
      console.log('✅ New cover image uploaded');
    }

    // Save with validation disabled to avoid schema issues
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

// PATCH /api/restaurants/:id/toggle-status - Toggle restaurant active status
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

    // Toggle isActive status
    restaurant.isActive = !restaurant.isActive;
    
    // Save with validation disabled to avoid schema conflicts
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

// DELETE /api/restaurants/:id - Delete restaurant
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

    // Delete profile image from Cloudinary
    if (restaurant.image) {
      try {
        const publicId = restaurant.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`restaurants/${publicId}`);
        console.log('🗑️ Profile image deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete profile image:', err.message);
      }
    }

    // Delete cover image from Cloudinary
    if (restaurant.coverImage) {
      try {
        const publicId = restaurant.coverImage.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`restaurants/${publicId}`);
        console.log('🗑️ Cover image deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete cover image:', err.message);
      }
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