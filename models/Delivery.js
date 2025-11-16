const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  // Reference to the order
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true // Each order has one delivery
  },
  
  // Reference to driver (User with userType: 'driver')
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Delivery status
  status: {
    type: String,
    enum: ['assigned', 'ongoing', 'completed', 'cancelled'],
    default: 'assigned'
  },
  
  // Timing
  startTime: {
    type: Date,
    default: null
  },
  endTime: {
    type: Date,
    default: null
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: null
  },
  actualDuration: {
    type: Number, // in minutes
    default: null
  },
  
  // Distance
  distance: {
    type: Number, // in kilometers
    default: null
  },
  
  // Pickup and delivery locations
  pickupLocation: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  deliveryLocation: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  
  // Real-time tracking
  currentLocation: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    lastUpdate: {
      type: Date,
      default: null
    }
  },
  
  // Route tracking (breadcrumb trail)
  route: [{
    latitude: Number,
    longitude: Number,
    timestamp: Date
  }],
  
  // Notes and issues
  notes: {
    type: String,
    default: null
  },
  issues: [{
    description: String,
    reportedAt: Date,
    resolvedAt: Date,
    isResolved: {
      type: Boolean,
      default: false
    }
  }],
  
  // Proof of delivery
  proofOfDelivery: {
    signature: String, // URL to signature image
    photo: String, // URL to delivery photo
    notes: String,
    timestamp: Date
  },
  
  // Earnings for this delivery
  earnings: {
    baseFee: Number,
    distanceFee: Number,
    tip: {
      type: Number,
      default: 0
    },
    total: Number
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Calculate actual duration when delivery is completed
deliverySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate actual duration if both start and end times are set
  if (this.startTime && this.endTime) {
    const durationMs = this.endTime - this.startTime;
    this.actualDuration = Math.round(durationMs / (1000 * 60)); // Convert to minutes
  }
  
  next();
});

// Index for faster queries
deliverySchema.index({ order: 1 });
deliverySchema.index({ driver: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Delivery', deliverySchema);