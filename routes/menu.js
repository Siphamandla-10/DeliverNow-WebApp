const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
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
        folder: 'menu-items',
        transformation: [
          { 
            width: 600,
            height: 450,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto:best',
            fetch_format: 'auto'
          }
        ]
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

// ========================================
// ROUTE ORDER IS CRITICAL!
// Specific routes MUST come before generic :id routes
// ========================================

// 1️⃣ GET /api/menu/restaurant/:restaurantId - MUST BE FIRST
router.get('/restaurant/:restaurantId', authMiddleware, async (req, res) => {
  try {
    const { category, available } = req.query;
    
    const query = { restaurant: req.params.restaurantId };
    
    if (category) {
      query.category = category;
    }
    
    if (available !== undefined) {
      query.isAvailable = available === 'true';
    }

    const menuItems = await MenuItem.find(query)
      .populate('restaurant', 'name')
      .sort({ category: 1, name: 1 });

    console.log(`✅ Found ${menuItems.length} menu items for restaurant ${req.params.restaurantId}`);

    res.json({
      success: true,
      data: menuItems,
      count: menuItems.length
    });

  } catch (error) {
    console.error('❌ Error fetching menu items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu items',
      error: error.message
    });
  }
});

// 2️⃣ POST /api/menu - Create new menu item
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('📥 Creating menu item');

    const {
      restaurantId,
      name,
      description,
      category,
      price,
      isVegetarian,
      isVegan,
      isGlutenFree,
      spiceLevel,
      preparationTime,
      calories
    } = req.body;

    if (!restaurantId || !name || !price || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID, name, description, price, and category are required'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    let imageData = null;
    if (req.file) {
      console.log('📤 Uploading menu item image to Cloudinary...');
      const result = await uploadToCloudinary(req.file.buffer);
      
      imageData = {
        filename: req.file.originalname,
        url: result.secure_url,
        cloudinaryId: result.public_id,
        uploadedAt: new Date()
      };
      
      console.log('✅ Image uploaded to Cloudinary:', result.secure_url);
    }

    const menuItem = new MenuItem({
      restaurant: restaurantId,
      name,
      description,
      category,
      price: parseFloat(price),
      image: imageData,
      isAvailable: true,
      isVegetarian: isVegetarian === 'true',
      isVegan: isVegan === 'true',
      isGlutenFree: isGlutenFree === 'true',
      spiceLevel: spiceLevel || 'None',
      preparationTime: preparationTime ? parseInt(preparationTime) : 15,
      calories: calories ? parseInt(calories) : null
    });

    await menuItem.save();
    console.log('✅ Menu item created:', menuItem.name);

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: menuItem
    });

  } catch (error) {
    console.error('❌ Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item',
      error: error.message
    });
  }
});

// 3️⃣ PATCH /api/menu/:id/toggle-availability - BEFORE other :id routes
router.patch('/:id/toggle-availability', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 Toggling availability for menu item:', req.params.id);
    
    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    menuItem.isAvailable = !menuItem.isAvailable;
    await menuItem.save();

    console.log(`✅ Menu item "${menuItem.name}" is now ${menuItem.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);

    res.json({
      success: true,
      message: `Menu item ${menuItem.isAvailable ? 'made available' : 'marked unavailable'}`,
      data: menuItem
    });

  } catch (error) {
    console.error('❌ Error toggling menu item availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle availability',
      error: error.message
    });
  }
});

// 4️⃣ PUT /api/menu/:id - Update menu item - BEFORE GET and DELETE
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('📝 PUT request received for menu item:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📷 Has file:', !!req.file);

    const {
      name,
      description,
      category,
      price,
      isVegetarian,
      isVegan,
      isGlutenFree,
      spiceLevel,
      preparationTime,
      calories
    } = req.body;

    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      console.log('❌ Menu item not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    console.log('✅ Menu item found:', menuItem.name);

    // Update fields
    if (name) menuItem.name = name;
    if (description !== undefined) menuItem.description = description;
    if (category) menuItem.category = category;
    if (price !== undefined) menuItem.price = parseFloat(price);
    if (preparationTime !== undefined) menuItem.preparationTime = parseInt(preparationTime);
    if (calories !== undefined) menuItem.calories = calories ? parseInt(calories) : null;
    if (spiceLevel) menuItem.spiceLevel = spiceLevel;
    
    // Handle boolean values (they come as strings from FormData)
    menuItem.isVegetarian = isVegetarian === 'true' || isVegetarian === true;
    menuItem.isVegan = isVegan === 'true' || isVegan === true;
    menuItem.isGlutenFree = isGlutenFree === 'true' || isGlutenFree === true;

    // Update image if new one is provided
    if (req.file) {
      console.log('📤 Uploading new menu item image...');
      
      // Delete old image if exists
      if (menuItem.image?.cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(menuItem.image.cloudinaryId);
          console.log('🗑️ Old image deleted from Cloudinary');
        } catch (err) {
          console.log('⚠️ Could not delete old image:', err.message);
        }
      }
      
      const result = await uploadToCloudinary(req.file.buffer);
      
      menuItem.image = {
        filename: req.file.originalname,
        url: result.secure_url,
        cloudinaryId: result.public_id,
        uploadedAt: new Date()
      };
      
      console.log('✅ New image uploaded to Cloudinary');
    }

    await menuItem.save();
    console.log('✅ Menu item updated successfully:', menuItem.name);

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: menuItem
    });

  } catch (error) {
    console.error('❌ Error updating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item',
      error: error.message
    });
  }
});

// 5️⃣ DELETE /api/menu/:id - Delete menu item
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('🗑️ Deleting menu item:', req.params.id);
    
    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Delete image from Cloudinary
    if (menuItem.image?.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(menuItem.image.cloudinaryId);
        console.log('✅ Menu item image deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete image from Cloudinary:', err.message);
      }
    }

    await MenuItem.findByIdAndDelete(req.params.id);
    console.log('✅ Menu item deleted:', menuItem.name);

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item',
      error: error.message
    });
  }
});

// 6️⃣ GET /api/menu/:id - Get single menu item - MUST BE LAST
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('📖 Fetching single menu item:', req.params.id);
    
    const menuItem = await MenuItem.findById(req.params.id)
      .populate('restaurant', 'name');
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    console.log('✅ Menu item found:', menuItem.name);

    res.json({
      success: true,
      data: menuItem
    });

  } catch (error) {
    console.error('❌ Error fetching menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu item',
      error: error.message
    });
  }
});

module.exports = router;