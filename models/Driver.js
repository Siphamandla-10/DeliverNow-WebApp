const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  // Reference to User model - this is the key relationship
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Each user can only have one driver profile
  },
  
  // Vehicle information
  vehicleType: {
    type: String,
    enum: ['car', 'bike', 'truck', 'van'],
    required: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true
  },
  licenseNumber: {
    type: String,
    required: true,
    trim: true
  },
  
  // Driver status
  status: {
    type: String,
    enum: ['active', 'inactive', 'busy'],
    default: 'inactive'
  },
  
  // Performance metrics
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  totalDeliveries: {
    type: Number,
    default: 0
  },
  completedDeliveries: {
    type: Number,
    default: 0
  },
  cancelledDeliveries: {
    type: Number,
    default: 0
  },
  
  // Current location (updated in real-time)
  location: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    address: {
      type: String,
      default: null
    },
    lastUpdate: {
      type: Date,
      default: null
    }
  },
  
  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  // Documents
  documents: {
    license: {
      url: String,
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date
    },
    insurance: {
      url: String,
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date
    },
    vehicleRegistration: {
      url: String,
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date
    }
  },
  
  // Earnings
  earnings: {
    total: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    },
    paid: {
      type: Number,
      default: 0
    }
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

// Update the updatedAt field before saving
driverSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
driverSchema.index({ user: 1 });
driverSchema.index({ status: 1 });
driverSchema.index({ isAvailable: 1 });

module.exports = mongoose.model('Driver', driverSchema);