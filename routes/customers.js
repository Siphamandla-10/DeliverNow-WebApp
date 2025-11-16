const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

// @route   GET /api/customers
// @desc    Get all customers (users with userType: 'customer')
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, search } = req.query;
    
    // Base query - get all users who are customers
    let query = { userType: 'customer' };
    
    // If filtering by status (active/inactive)
    if (status && status !== 'all') {
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await User.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with order stats
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const totalOrders = await Order.countDocuments({
          customer: customer._id
        });

        const completedOrders = await Order.countDocuments({
          customer: customer._id,
          status: 'delivered'
        });

        const activeOrders = await Order.countDocuments({
          customer: customer._id,
          status: { $in: ['pending', 'confirmed', 'picked_up', 'in_transit'] }
        });

        const cancelledOrders = await Order.countDocuments({
          customer: customer._id,
          status: 'cancelled'
        });

        // Calculate total amount spent
        const orderStats = await Order.aggregate([
          { $match: { customer: customer._id, status: 'delivered' } },
          { $group: { _id: null, totalSpent: { $sum: '$totalAmount' } } }
        ]);

        const totalSpent = orderStats.length > 0 ? orderStats[0].totalSpent : 0;

        // Return flattened structure
        return {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          userType: customer.userType,
          isActive: customer.isActive,
          isVerified: customer.isVerified,
          status: customer.isActive ? 'active' : 'inactive',
          location: customer.location,
          currentAddress: customer.currentAddress,
          addresses: customer.addresses || [],
          totalOrders,
          completedOrders,
          activeOrders,
          cancelledOrders,
          totalSpent,
          createdAt: customer.createdAt,
          lastLogin: customer.accountActivity?.lastLogin || null
        };
      })
    );

    console.log(`✅ Returning ${customersWithStats.length} customers from users collection`);

    res.status(200).json({
      success: true,
      count: customersWithStats.length,
      data: customersWithStats
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer by ID with full details
// @access  Private
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).lean();

    if (!customer || customer.userType !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get order stats
    const totalOrders = await Order.countDocuments({ customer: customer._id });
    const completedOrders = await Order.countDocuments({ customer: customer._id, status: 'delivered' });
    const activeOrders = await Order.countDocuments({ 
      customer: customer._id, 
      status: { $in: ['pending', 'confirmed', 'picked_up', 'in_transit'] }
    });

    // Get recent orders
    const recentOrders = await Order.find({ customer: customer._id })
      .populate('restaurant', 'name cuisine')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Calculate total spent
    const orderStats = await Order.aggregate([
      { $match: { customer: customer._id, status: 'delivered' } },
      { $group: { _id: null, totalSpent: { $sum: '$totalAmount' } } }
    ]);

    const totalSpent = orderStats.length > 0 ? orderStats[0].totalSpent : 0;

    const customerDetails = {
      ...customer,
      totalOrders,
      completedOrders,
      activeOrders,
      totalSpent,
      recentOrders
    };

    res.status(200).json({
      success: true,
      data: customerDetails
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer',
      error: error.message
    });
  }
});

// @route   POST /api/customers
// @desc    Create new customer (user with userType: 'customer')
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      password,
      country,
      city,
      region,
      address
    } = req.body;

    console.log('📝 Received customer registration data:', { name, email, phone });

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, phone, password'
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

    // Create new customer
    const newCustomer = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      userType: 'customer',
      location: {
        latitude: null,
        longitude: null,
        city: city || null,
        region: region || null,
        country: country || 'South Africa',
        lastLocationUpdate: null
      },
      currentAddress: address || {},
      addresses: address ? [address] : [],
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
      loginHistory: []
    });

    await newCustomer.save();
    console.log('✅ Customer created:', newCustomer._id);

    // Format response
    const customerResponse = {
      _id: newCustomer._id,
      name: newCustomer.name,
      email: newCustomer.email,
      phone: newCustomer.phone,
      userType: newCustomer.userType,
      isActive: newCustomer.isActive,
      isVerified: newCustomer.isVerified,
      status: 'active',
      location: newCustomer.location,
      currentAddress: newCustomer.currentAddress,
      addresses: newCustomer.addresses,
      totalOrders: 0,
      completedOrders: 0,
      activeOrders: 0,
      totalSpent: 0,
      createdAt: newCustomer.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: customerResponse
    });
  } catch (error) {
    console.error('❌ Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer information
// @access  Private
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, status, location, currentAddress } = req.body;

    console.log('📝 Updating customer:', req.params.id);

    const customer = await User.findById(req.params.id);
    if (!customer || customer.userType !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Update fields
    if (name) customer.name = name;
    if (email) customer.email = email.toLowerCase();
    if (phone) customer.phone = phone;
    if (location) customer.location = location;
    if (currentAddress) customer.currentAddress = currentAddress;
    
    // Map status to isActive
    if (status) {
      customer.isActive = (status === 'active');
    }

    customer.updatedAt = Date.now();
    await customer.save();

    console.log('✅ Customer updated successfully');

    // Get updated stats
    const totalOrders = await Order.countDocuments({ customer: customer._id });
    const completedOrders = await Order.countDocuments({ customer: customer._id, status: 'delivered' });
    const activeOrders = await Order.countDocuments({ 
      customer: customer._id, 
      status: { $in: ['pending', 'confirmed', 'picked_up', 'in_transit'] }
    });

    const customerResponse = {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      userType: customer.userType,
      isActive: customer.isActive,
      isVerified: customer.isVerified,
      status: customer.isActive ? 'active' : 'inactive',
      location: customer.location,
      currentAddress: customer.currentAddress,
      addresses: customer.addresses,
      totalOrders,
      completedOrders,
      activeOrders,
      createdAt: customer.createdAt
    };

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customerResponse
    });
  } catch (error) {
    console.error('❌ Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
});

// @route   PUT /api/customers/:id/password
// @desc    Update customer password
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

    const customer = await User.findById(req.params.id).select('+password');
    if (!customer || customer.userType !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Verify current password if provided
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, customer.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    customer.password = await bcrypt.hash(newPassword, salt);
    customer.updatedAt = Date.now();
    
    await customer.save();

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

// @route   DELETE /api/customers/:id
// @desc    Delete customer
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await User.findById(req.params.id);
    if (!customer || customer.userType !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer has active orders
    const activeOrders = await Order.countDocuments({
      customer: customer._id,
      status: { $in: ['pending', 'confirmed', 'picked_up', 'in_transit'] }
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete customer with active orders'
      });
    }

    // Delete customer
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message
    });
  }
});

module.exports = router;