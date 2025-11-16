const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem'); // ✅ ADD THIS IMPORT!

// @route   GET /api/orders
// @desc    Get all orders with proper relationships
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Build query
    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    // Fetch orders with all proper relationships INCLUDING menu items
    const orders = await Order.find(query)
      .populate('customer', 'name email phone addresses currentAddress')
      .populate('driver', 'name email phone')
      .populate('restaurant', 'name cuisine image address')
      .populate({
        path: 'items.menuItem',
        model: 'MenuItem', // Explicitly specify the model
        select: 'name description price image images category isAvailable'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Get delivery information for each order
    const ordersWithDelivery = await Promise.all(
      orders.map(async (order) => {
        // Find the delivery for this order
        const delivery = await Delivery.findOne({ order: order._id })
          .select('status startTime endTime distance duration notes')
          .lean();

        // Get customer's delivery address
        let deliveryAddress = order.deliveryAddress;
        
        if (!deliveryAddress && order.customer?.currentAddress) {
          deliveryAddress = order.customer.currentAddress;
        }
        
        if (!deliveryAddress && order.customer?.addresses && order.customer.addresses.length > 0) {
          deliveryAddress = order.customer.addresses[0];
        }

        // Process items - use menuItem data if available, otherwise use stored data
        const processedItems = order.items.map(item => {
          // If menuItem was populated and exists
          if (item.menuItem && typeof item.menuItem === 'object' && item.menuItem.name) {
            return {
              _id: item._id,
              menuItemId: item.menuItem._id,
              name: item.menuItem.name,
              description: item.menuItem.description,
              category: item.menuItem.category,
              price: item.price, // Use order price (may differ due to promotions)
              quantity: item.quantity,
              subtotal: item.subtotal || (item.price * item.quantity),
              image: item.menuItem.image,
              images: item.menuItem.images,
              isAvailable: item.menuItem.isAvailable,
              specialInstructions: item.specialInstructions
            };
          } 
          // Otherwise use the denormalized data stored in the order
          else {
            return {
              _id: item._id,
              menuItemId: item.menuItem, // Might be an ID or null
              name: item.name,
              description: item.description || null,
              category: item.category || null,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal || (item.price * item.quantity),
              image: item.image || null,
              images: item.images || null,
              specialInstructions: item.specialInstructions
            };
          }
        });

        return {
          ...order,
          items: processedItems,
          delivery: delivery || null,
          deliveryStatus: delivery?.status || order.status,
          deliveryAddress: deliveryAddress || order.deliveryAddress
        };
      })
    );

    console.log(`Found ${ordersWithDelivery.length} orders with delivery info`);

    res.status(200).json({
      success: true,
      count: ordersWithDelivery.length,
      data: ordersWithDelivery
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order by ID with full details
// @access  Private
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone addresses currentAddress')
      .populate('driver', 'name email phone location')
      .populate('restaurant', 'name cuisine image address contact')
      .populate({
        path: 'items.menuItem',
        model: 'MenuItem',
        select: 'name description price image images category isAvailable'
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get delivery information
    const delivery = await Delivery.findOne({ order: order._id })
      .select('status startTime endTime distance duration notes')
      .lean();

    // Get customer's delivery address
    let deliveryAddress = order.deliveryAddress;
    if (!deliveryAddress && order.customer?.currentAddress) {
      deliveryAddress = order.customer.currentAddress;
    }
    if (!deliveryAddress && order.customer?.addresses && order.customer.addresses.length > 0) {
      deliveryAddress = order.customer.addresses[0];
    }

    // Process items
    const processedItems = order.items.map(item => {
      if (item.menuItem && typeof item.menuItem === 'object' && item.menuItem.name) {
        return {
          _id: item._id,
          menuItemId: item.menuItem._id,
          name: item.menuItem.name,
          description: item.menuItem.description,
          category: item.menuItem.category,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal || (item.price * item.quantity),
          image: item.menuItem.image,
          images: item.menuItem.images,
          isAvailable: item.menuItem.isAvailable,
          specialInstructions: item.specialInstructions
        };
      } else {
        return {
          _id: item._id,
          menuItemId: item.menuItem,
          name: item.name,
          description: item.description || null,
          category: item.category || null,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal || (item.price * item.quantity),
          image: item.image || null,
          images: item.images || null,
          specialInstructions: item.specialInstructions
        };
      }
    });

    const orderWithDelivery = {
      ...order,
      items: processedItems,
      delivery: delivery || null,
      deliveryStatus: delivery?.status || order.status,
      deliveryAddress: deliveryAddress || order.deliveryAddress
    };

    res.status(200).json({
      success: true,
      data: orderWithDelivery
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status and delivery status
// @access  Private
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Update order status
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true }
    )
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('restaurant', 'name cuisine')
      .populate({
        path: 'items.menuItem',
        model: 'MenuItem',
        select: 'name description price image images'
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update delivery status if exists
    const delivery = await Delivery.findOne({ order: req.params.id });
    if (delivery) {
      let deliveryStatus = 'assigned';
      
      if (status === 'delivered') {
        deliveryStatus = 'completed';
        delivery.endTime = new Date();
      } else if (['picked_up', 'in_transit'].includes(status)) {
        deliveryStatus = 'ongoing';
        if (!delivery.startTime) {
          delivery.startTime = new Date();
        }
      }
      
      delivery.status = deliveryStatus;
      await delivery.save();
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
});

module.exports = router;