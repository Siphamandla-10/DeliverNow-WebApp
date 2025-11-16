const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // Customer reference (User with userType: 'customer')
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Driver reference (User with userType: 'driver')
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Restaurant reference
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  
  // Order items
  items: [{
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem'
    },
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    subtotal: {
      type: Number,
      required: false
    },
    specialInstructions: String
  }],
  
  // Pricing
  subtotal: {
    type: Number,
    required: false,
    default: 0
  },
  deliveryFee: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  
  // Pickup location (restaurant address)
  pickupAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'South Africa'
    },
    latitude: Number,
    longitude: Number
  },
  
  // Delivery location (customer address)
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'South Africa'
    },
    latitude: Number,
    longitude: Number
  },
  
  // Order status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  // Payment information
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'online'],
    default: 'cash'
  },
  paymentIntentId: String, // For Stripe or other payment gateways
  
  // Timing
  scheduledPickupTime: Date,
  scheduledDeliveryTime: Date,
  actualPickupTime: Date,
  actualDeliveryTime: Date,
  estimatedDeliveryTime: Date,
  
  // Additional information
  specialInstructions: String,
  cancellationReason: String,
  
  // Reviews and ratings
  rating: {
    type: Number,
    min: 0,
    max: 5
  },
  review: String,
  reviewedAt: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate order number before saving
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Generate order number if not exists
  if (!this.orderNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderNumber = `ORD-${timestamp}-${random}`;
  }
  
  next();
});

// Index for faster queries (orderNumber already unique, don't duplicate)
orderSchema.index({ customer: 1 });
orderSchema.index({ driver: 1 });
orderSchema.index({ restaurant: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);