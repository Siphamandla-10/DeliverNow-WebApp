const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Restaurant name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  cuisine: {
    type: String,
    required: [true, 'Cuisine type is required'],
    trim: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make it optional to avoid validation errors
  },
  image: {
    type: String, // Profile/Logo image URL
    default: null
  },
  coverImage: {
    type: String, // Banner/Cover image URL
    default: null
  },
  contact: {
    phone: {
      type: String,
      required: [true, 'Phone number is required']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true
    }
  },
  address: {
    street: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      default: ''
    },
    state: {
      type: String,
      default: ''
    },
    zipCode: {
      type: String,
      default: ''
    },
    coordinates: {
      latitude: {
        type: Number,
        default: -26.2041
      },
      longitude: {
        type: Number,
        default: 28.0473
      }
    }
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: [0, 'Delivery fee cannot be negative']
  },
  minimumOrder: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order cannot be negative']
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'busy'],
    default: 'open'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  openingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  tags: [{
    type: String
  }],
  featured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
restaurantSchema.index({ name: 'text', cuisine: 'text' });
restaurantSchema.index({ vendor: 1 });
restaurantSchema.index({ isActive: 1 });
restaurantSchema.index({ status: 1 });
restaurantSchema.index({ 'address.coordinates.latitude': 1, 'address.coordinates.longitude': 1 });

// Virtual for full address
restaurantSchema.virtual('fullAddress').get(function() {
  const parts = [
    this.address.street,
    this.address.city,
    this.address.state,
    this.address.zipCode
  ].filter(Boolean);
  return parts.join(', ');
});

// Ensure virtuals are included in JSON
restaurantSchema.set('toJSON', { virtuals: true });
restaurantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Restaurant', restaurantSchema);