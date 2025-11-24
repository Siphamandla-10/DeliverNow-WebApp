const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');

// Try to load the correct auth middleware
let authMiddleware;
try {
  authMiddleware = require('../middleware/authMiddleware');
  console.log('✅ Using authMiddleware.js');
} catch (e) {
  try {
    authMiddleware = require('../middleware/auth');
    console.log('✅ Using auth.js');
  } catch (e2) {
    console.error('❌ Could not find auth middleware!');
    authMiddleware = (req, res, next) => next();
  }
}

// GET /api/orders - Get all orders with populated data
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📋 GET /api/orders ROUTE CALLED');
    console.log('Time:', new Date().toISOString());
    console.log('========================================\n');
    
    console.log('🔍 Fetching orders from database...');
    
    let orders = await Order.find()
      .populate({
        path: 'user',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'driver',
        select: 'name email phone vehicleType vehicleNumber',
        model: 'User'
      })
      .populate({
        path: 'restaurant',
        select: 'name cuisine image address'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description image category'
      })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${orders.length} orders from database\n`);
    
    // Check first order BEFORE manual population
    if (orders.length > 0) {
      console.log('📦 FIRST ORDER (BEFORE MANUAL POPULATION):');
      console.log('Order Number:', orders[0].orderNumber);
      console.log('User field type:', typeof orders[0].user);
      console.log('User field value:', orders[0].user);
      console.log('User is string?:', typeof orders[0].user === 'string');
      console.log('User is object?:', typeof orders[0].user === 'object' && orders[0].user !== null);
      if (typeof orders[0].user === 'object' && orders[0].user !== null) {
        console.log('User name:', orders[0].user.name);
        console.log('User email:', orders[0].user.email);
      }
      console.log('Driver:', orders[0].driver);
      console.log('Restaurant:', orders[0].restaurant);
      console.log('');
    }
    
    // Manual population fallback for user field if it's still an ID
    console.log('🔧 Checking if manual population needed...');
    let manuallyPopulated = 0;
    
    for (let order of orders) {
      if (order.user && typeof order.user === 'string') {
        console.log(`⚠️ Order ${order.orderNumber}: User not populated, ID is ${order.user}`);
        const user = await User.findById(order.user).select('name email phone').lean();
        if (user) {
          order.user = user;
          manuallyPopulated++;
          console.log(`✅ Manually populated user: ${user.name}`);
        } else {
          console.log(`❌ User not found in database for ID: ${order.user}`);
        }
      }
    }
    
    console.log(`\n📊 Manually populated ${manuallyPopulated} users\n`);
    
    // Check first order AFTER manual population
    if (orders.length > 0) {
      console.log('📦 FIRST ORDER (AFTER MANUAL POPULATION):');
      console.log('User field type:', typeof orders[0].user);
      console.log('User field value:', JSON.stringify(orders[0].user, null, 2));
      console.log('');
    }
    
    console.log('📤 Sending response to frontend...\n');
    console.log('========================================\n');

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// GET /api/orders/:id - Get single order
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({
        path: 'user',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'driver',
        select: 'name email phone vehicleType vehicleNumber',
        model: 'User'
      })
      .populate({
        path: 'restaurant',
        select: 'name cuisine image address'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description image category'
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Manual population for user if needed
    if (order.user && typeof order.user === 'string') {
      const user = await User.findById(order.user).select('name email phone').lean();
      if (user) {
        order.user = user;
      }
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

// POST /api/orders - Create new order
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('📝 Creating new order...');
    console.log('Request body:', req.body);

    const {
      user,
      restaurant,
      items,
      deliveryAddress,
      deliveryFee,
      subtotal,
      tax,
      totalAmount,
      paymentMethod
    } = req.body;

    // Validation
    if (!user || !restaurant || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User, restaurant, and items are required'
      });
    }

    // Verify user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate order number
    const orderCount = await Order.countDocuments();
    const orderNumber = `ORD-${Date.now()}-${orderCount + 1}`;

    const order = new Order({
      orderNumber,
      user,
      restaurant,
      items,
      deliveryAddress,
      deliveryFee: deliveryFee || 0,
      subtotal: subtotal || 0,
      tax: tax || 0,
      totalAmount: totalAmount || 0,
      paymentMethod: paymentMethod || 'cash',
      status: 'pending',
      deliveryStatus: 'pending'
    });

    await order.save();

    // Populate before sending response
    await order.populate([
      { path: 'user', select: 'name email phone', model: 'User' },
      { path: 'restaurant', select: 'name cuisine image address' },
      { path: 'items.menuItem', select: 'name description image category' }
    ]);

    console.log('✅ Order created:', order.orderNumber);
    console.log('   User:', order.user?.name);
    console.log('   Restaurant:', order.restaurant?.name);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });

  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// PUT /api/orders/:id/status - Update order status
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    console.log(`🔄 Updating order status: ${req.params.id}`);
    
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    // Valid statuses
    const validStatuses = ['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        $set: {
          status,
          deliveryStatus: status,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status,
            timestamp: new Date()
          }
        }
      },
      { 
        new: true,
        runValidators: false
      }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Populate before sending response
    await order.populate([
      { path: 'user', select: 'name email phone', model: 'User' },
      { path: 'driver', select: 'name email phone vehicleType vehicleNumber', model: 'User' },
      { path: 'restaurant', select: 'name cuisine' },
      { path: 'items.menuItem', select: 'name description image category' }
    ]);

    // Manual population for user if needed
    if (order.user && typeof order.user === 'string') {
      const user = await User.findById(order.user).select('name email phone').lean();
      if (user) {
        order.user = user;
      }
    }

    console.log(`✅ Order status updated to: ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
});

// PUT /api/orders/:id/assign-driver - Assign driver to order
router.put('/:id/assign-driver', authMiddleware, async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    // Verify driver exists and is actually a driver
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (driver.userType !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          driver: driverId,
          status: 'assigned',
          deliveryStatus: 'assigned',
          updatedAt: new Date()
        }
      },
      {
        new: true,
        runValidators: false
      }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    await order.populate([
      { path: 'user', select: 'name email phone', model: 'User' },
      { path: 'driver', select: 'name email phone vehicleType', model: 'User' },
      { path: 'restaurant', select: 'name cuisine' },
      { path: 'items.menuItem', select: 'name description image category' }
    ]);

    // Manual population for user if needed
    if (order.user && typeof order.user === 'string') {
      const user = await User.findById(order.user).select('name email phone').lean();
      if (user) {
        order.user = user;
      }
    }

    console.log(`✅ Driver assigned to order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Driver assigned successfully',
      data: order
    });

  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: error.message
    });
  }
});

// DELETE /api/orders/:id - Delete order
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    await Order.findByIdAndDelete(req.params.id);

    console.log('✅ Order deleted:', order.orderNumber);

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: error.message
    });
  }
});

// GET /api/orders/customer/:customerId - Get orders by customer
router.get('/customer/:customerId', authMiddleware, async (req, res) => {
  try {
    let orders = await Order.find({ user: req.params.customerId })
      .populate({
        path: 'user',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'driver',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'restaurant',
        select: 'name cuisine image'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description image category'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Manual population for user if needed
    for (let order of orders) {
      if (order.user && typeof order.user === 'string') {
        const user = await User.findById(order.user).select('name email phone').lean();
        if (user) {
          order.user = user;
        }
      }
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer orders',
      error: error.message
    });
  }
});

// GET /api/orders/driver/:driverId - Get orders by driver
router.get('/driver/:driverId', authMiddleware, async (req, res) => {
  try {
    let orders = await Order.find({ driver: req.params.driverId })
      .populate({
        path: 'user',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'driver',
        select: 'name email phone vehicleType',
        model: 'User'
      })
      .populate({
        path: 'restaurant',
        select: 'name cuisine image'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description image category'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Manual population for user if needed
    for (let order of orders) {
      if (order.user && typeof order.user === 'string') {
        const user = await User.findById(order.user).select('name email phone').lean();
        if (user) {
          order.user = user;
        }
      }
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Error fetching driver orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver orders',
      error: error.message
    });
  }
});

// GET /api/orders/restaurant/:restaurantId - Get orders by restaurant
router.get('/restaurant/:restaurantId', authMiddleware, async (req, res) => {
  try {
    let orders = await Order.find({ restaurant: req.params.restaurantId })
      .populate({
        path: 'user',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'driver',
        select: 'name email phone',
        model: 'User'
      })
      .populate({
        path: 'restaurant',
        select: 'name cuisine image'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description image category'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Manual population for user if needed
    for (let order of orders) {
      if (order.user && typeof order.user === 'string') {
        const user = await User.findById(order.user).select('name email phone').lean();
        if (user) {
          order.user = user;
        }
      }
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Error fetching restaurant orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant orders',
      error: error.message
    });
  }
});

module.exports = router;