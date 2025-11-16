const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

// @route   GET /api/drivers
// @desc    Get all drivers (users with userType: 'driver')
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Base query - get all users who are drivers
    let query = { userType: 'driver' };
    
    // If filtering by status (active/inactive), add to query
    // Note: We'll use isActive from User model
    if (status && status !== 'all') {
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }
    }

    const drivers = await User.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with delivery stats and add missing fields
    const driversWithStats = await Promise.all(
      drivers.map(async (driver) => {
        const completedDeliveries = await Delivery.countDocuments({
          driver: driver._id,
          status: 'completed'
        });

        const activeDeliveries = await Delivery.countDocuments({
          driver: driver._id,
          status: { $in: ['assigned', 'ongoing'] }
        });

        // Get completed orders (alternative to deliveries)
        const completedOrders = await Order.countDocuments({
          driver: driver._id,
          status: 'delivered'
        });

        // Return flattened structure that matches frontend expectations
        return {
          _id: driver._id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          userType: driver.userType,
          isActive: driver.isActive,
          isVerified: driver.isVerified,
          // Return actual values or null, don't set 'N/A'
          vehicleType: driver.vehicleType || null,
          vehicleNumber: driver.vehicleNumber || null,
          licenseNumber: driver.licenseNumber || null,
          // Map isActive to status for frontend compatibility
          status: driver.isActive ? 'active' : 'inactive',
          rating: driver.rating || 5.0,
          totalDeliveries: completedOrders || completedDeliveries || 0,
          completedDeliveries: completedDeliveries || completedOrders || 0,
          activeDeliveries: activeDeliveries || 0,
          location: driver.location,
          currentAddress: driver.currentAddress,
          createdAt: driver.createdAt,
          user: {
            _id: driver._id,
            name: driver.name,
            email: driver.email,
            phone: driver.phone,
            userType: driver.userType,
            isActive: driver.isActive,
            isVerified: driver.isVerified
          }
        };
      })
    );

    console.log(`✅ Returning ${driversWithStats.length} drivers from users collection`);

    res.status(200).json({
      success: true,
      count: driversWithStats.length,
      data: driversWithStats
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching drivers',
      error: error.message
    });
  }
});

// @route   POST /api/drivers
// @desc    Create new driver (user with userType: 'driver')
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      password,
      vehicleType, 
      vehicleNumber, 
      licenseNumber,
      country,
      city,
      region
    } = req.body;

    console.log('📝 Received driver registration data:', { name, email, phone, vehicleType, vehicleNumber, licenseNumber });

    // Validate required fields
    if (!name || !email || !phone || !password || !vehicleType || !vehicleNumber || !licenseNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, phone, password, vehicleType, vehicleNumber, licenseNumber'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Check if user with phone already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'A user with this phone number already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new driver (user with userType: driver)
    const newDriver = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      userType: 'driver',
      // Add vehicle information directly to user
      vehicleType,
      vehicleNumber,
      licenseNumber,
      rating: 5.0,
      location: {
        latitude: null,
        longitude: null,
        city: city || null,
        region: region || null,
        country: country || 'South Africa',
        lastLocationUpdate: null
      },
      currentAddress: {},
      isVerified: false,
      isActive: true,
      preferences: {},
      phoneVerification: {
        isVerified: false
      },
      accountActivity: {
        loginCount: 0
      },
      agreements: {
        termsAccepted: false,
        privacyAccepted: false
      },
      metadata: {},
      addresses: [],
      loginHistory: []
    });

    await newDriver.save();
    console.log('✅ Driver created:', newDriver._id);

    // Format response to match frontend expectations
    const driverResponse = {
      _id: newDriver._id,
      name: newDriver.name,
      email: newDriver.email,
      phone: newDriver.phone,
      userType: newDriver.userType,
      isActive: newDriver.isActive,
      isVerified: newDriver.isVerified,
      vehicleType: newDriver.vehicleType,
      vehicleNumber: newDriver.vehicleNumber,
      licenseNumber: newDriver.licenseNumber,
      status: newDriver.isActive ? 'active' : 'inactive',
      rating: newDriver.rating || 5.0,
      totalDeliveries: 0,
      completedDeliveries: 0,
      activeDeliveries: 0,
      location: newDriver.location,
      createdAt: newDriver.createdAt,
      user: {
        _id: newDriver._id,
        name: newDriver.name,
        email: newDriver.email,
        phone: newDriver.phone,
        userType: newDriver.userType,
        isActive: newDriver.isActive,
        isVerified: newDriver.isVerified
      }
    };

    res.status(201).json({
      success: true,
      message: 'Driver registered successfully',
      data: driverResponse
    });
  } catch (error) {
    console.error('❌ Error creating driver:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating driver',
      error: error.message
    });
  }
});

// @route   PUT /api/drivers/:id
// @desc    Update driver information
// @access  Private
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, licenseNumber, status, location, name, email, phone } = req.body;

    console.log('📝 Updating driver:', req.params.id);
    console.log('📝 Update data:', { vehicleType, vehicleNumber, licenseNumber, status, name, email, phone });

    const driver = await User.findById(req.params.id);
    if (!driver) {
      console.log('❌ User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (driver.userType !== 'driver') {
      console.log('❌ User is not a driver, userType:', driver.userType);
      return res.status(404).json({
        success: false,
        message: 'This user is not a driver'
      });
    }

    // Update user fields
    if (name) driver.name = name;
    if (email) driver.email = email.toLowerCase();
    if (phone) driver.phone = phone;
    if (vehicleType) driver.vehicleType = vehicleType;
    if (vehicleNumber) driver.vehicleNumber = vehicleNumber;
    if (licenseNumber) driver.licenseNumber = licenseNumber;
    if (location) driver.location = location;
    
    // Map status to isActive
    if (status) {
      driver.isActive = (status === 'active');
    }

    driver.updatedAt = Date.now();
    
    console.log('💾 Saving driver updates...');
    await driver.save();
    console.log('✅ Driver saved successfully');

    // Return formatted response
    const driverResponse = {
      _id: driver._id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      userType: driver.userType,
      isActive: driver.isActive,
      isVerified: driver.isVerified,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      licenseNumber: driver.licenseNumber,
      status: driver.isActive ? 'active' : 'inactive',
      rating: driver.rating || 5.0,
      totalDeliveries: 0,
      location: driver.location,
      user: {
        _id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        userType: driver.userType,
        isActive: driver.isActive,
        isVerified: driver.isVerified
      }
    };

    res.status(200).json({
      success: true,
      message: 'Driver updated successfully',
      data: driverResponse
    });
  } catch (error) {
    console.error('❌ Error updating driver:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error updating driver',
      error: error.message,
      details: error.stack
    });
  }
});

// @route   PUT /api/drivers/:id/password
// @desc    Update driver password
// @access  Private
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    const { newPassword, currentPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const driver = await User.findById(req.params.id).select('+password');
    if (!driver || driver.userType !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Verify current password if provided
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, driver.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    driver.password = await bcrypt.hash(newPassword, salt);
    driver.updatedAt = Date.now();
    
    await driver.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating password',
      error: error.message
    });
  }
});

// @route   DELETE /api/drivers/:id
// @desc    Delete driver
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    if (!driver || driver.userType !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Check if driver has active deliveries
    const activeDeliveries = await Delivery.countDocuments({
      driver: driver._id,
      status: { $in: ['assigned', 'ongoing'] }
    });

    // Check if driver has active orders
    const activeOrders = await Order.countDocuments({
      driver: driver._id,
      status: { $in: ['confirmed', 'picked_up', 'in_transit'] }
    });

    if (activeDeliveries > 0 || activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete driver with active deliveries or orders'
      });
    }

    // Delete driver (user)
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting driver:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting driver',
      error: error.message
    });
  }
});

module.exports = router;