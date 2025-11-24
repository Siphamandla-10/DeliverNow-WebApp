const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  userType: {
    type: String,
    enum: ['customer', 'vendor', 'driver', 'admin'],
    default: 'customer',
    required: true
  },
  
  // Driver-specific fields (only used when userType is 'driver')
  vehicleType: {
    type: String,
    default: null
  },
  vehicleNumber: {
    type: String,
    default: null
  },
  licenseNumber: {
    type: String,
    default: null
  },
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  
  // Location information
  location: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    city: {
      type: String,
      default: null
    },
    region: {
      type: String,
      default: null
    },
    country: {
      type: String,
      default: 'South Africa'
    },
    lastLocationUpdate: {
      type: Date,
      default: null
    }
  },
  
  // Current address
  currentAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    latitude: Number,
    longitude: Number
  },
  
  // Account status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // User preferences
  preferences: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Phone verification
  phoneVerification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationCode: String,
    verificationExpiry: Date
  },
  
  // Account activity
  accountActivity: {
    lastLogin: Date,
    loginCount: {
      type: Number,
      default: 0
    }
  },
  
  // Agreements
  agreements: {
    termsAccepted: {
      type: Boolean,
      default: false
    },
    termsAcceptedDate: Date,
    privacyAccepted: {
      type: Boolean,
      default: false
    },
    privacyAcceptedDate: Date
  },
  
  // Additional metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Saved addresses (for customers)
  addresses: [{
    label: String, // e.g., "Home", "Work"
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    latitude: Number,
    longitude: Number,
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  
  // Login history
  loginHistory: [{
    timestamp: Date,
    ipAddress: String,
    userAgent: String,
    location: String
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ========================================
// PASSWORD HASHING - PRE-SAVE HOOK
// ========================================
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt
    const salt = await bcrypt.genSalt(10);
    
    // Hash password
    this.password = await bcrypt.hash(this.password, salt);
    
    console.log('✅ Password hashed for user:', this.email);
    next();
  } catch (error) {
    console.error('❌ Password hashing error:', error);
    next(error);
  }
});

// ========================================
// PASSWORD COMPARISON METHOD
// ========================================
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('🔐 Password comparison for', this.email, ':', isMatch ? '✅ Match' : '❌ No match');
    return isMatch;
  } catch (error) {
    console.error('❌ Password comparison error:', error);
    throw error;
  }
};

// ========================================
// UPDATE TIMESTAMP
// ========================================
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ userType: 1 });

// ========================================
// EXPORT MODEL (PREVENT DUPLICATE COMPILATION)
// ========================================
module.exports = mongoose.models.User || mongoose.model('User', userSchema);