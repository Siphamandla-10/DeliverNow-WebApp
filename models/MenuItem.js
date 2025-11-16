const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Menu item name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Restaurant is required'],
    index: true
  },
  
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Appetizers', 
      'Main Course', 
      'Desserts', 
      'Beverages', 
      'Sides', 
      'Salads', 
      'Soups', 
      'Pizza', 
      'Burgers', 
      'Sandwiches', 
      'Pasta', 
      'Seafood', 
      'Vegetarian', 
      'Specials'
    ]
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  
  // Image with Cloudinary support
  image: {
    filename: { 
      type: String, 
      default: '' 
    },
    path: { 
      type: String, 
      default: '' 
    },
    url: { 
      type: String, 
      default: '' 
    },
    cloudinaryId: { 
      type: String, 
      default: '' 
    },
    uploadedAt: { 
      type: Date 
    }
  },
  
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  isVegetarian: {
    type: Boolean,
    default: false
  },
  
  isVegan: {
    type: Boolean,
    default: false
  },
  
  isGlutenFree: {
    type: Boolean,
    default: false
  },
  
  spiceLevel: {
    type: String,
    enum: ['None', 'Mild', 'Medium', 'Hot', 'Extra Hot'],
    default: 'None'
  },
  
  preparationTime: {
    type: Number, // in minutes
    default: 15,
    min: 0
  },
  
  calories: {
    type: Number,
    default: null,
    min: 0
  },
  
  ingredients: [{
    type: String,
    trim: true
  }],
  
  allergens: [{
    type: String,
    trim: true
  }],
  
  tags: [{
    type: String,
    trim: true
  }],
  
  popularity: {
    type: Number,
    default: 0,
    min: 0
  },
  
  orderCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  rating: {
    average: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 5 
    },
    count: { 
      type: Number, 
      default: 0,
      min: 0
    }
  },
  
  // Stock management (optional)
  stockManagement: {
    trackStock: { 
      type: Boolean, 
      default: false 
    },
    currentStock: { 
      type: Number, 
      default: 0,
      min: 0
    },
    lowStockThreshold: { 
      type: Number, 
      default: 5,
      min: 0
    },
    isOutOfStock: { 
      type: Boolean, 
      default: false 
    }
  },
  
  // Display options
  featured: { 
    type: Boolean, 
    default: false 
  },
  
  displayOrder: { 
    type: Number, 
    default: 0 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
menuItemSchema.index({ restaurant: 1, category: 1 });
menuItemSchema.index({ restaurant: 1, isAvailable: 1 });
menuItemSchema.index({ category: 1, isAvailable: 1 });
menuItemSchema.index({ featured: 1, restaurant: 1 });
menuItemSchema.index({ popularity: -1 });
menuItemSchema.index({ orderCount: -1 });

// Virtual: Get main image URL with fallback
menuItemSchema.virtual('imageUrl').get(function () {
  if (this.image?.url) {
    return this.image.url;
  }
  return null; // or '/images/default-food.png' for a default image
});

// Virtual: Check if item is actually available (considering stock)
menuItemSchema.virtual('isActuallyAvailable').get(function() {
  if (!this.isAvailable) return false;
  if (this.stockManagement.trackStock) {
    return !this.stockManagement.isOutOfStock && this.stockManagement.currentStock > 0;
  }
  return true;
});

// Virtual: Check if low stock
menuItemSchema.virtual('isLowStock').get(function() {
  if (!this.stockManagement.trackStock) return false;
  return this.stockManagement.currentStock > 0 && 
         this.stockManagement.currentStock <= this.stockManagement.lowStockThreshold;
});

// Method: Update stock
menuItemSchema.methods.updateStock = async function(quantity, operation = 'subtract') {
  if (!this.stockManagement.trackStock) return this;
  
  if (operation === 'subtract') {
    this.stockManagement.currentStock = Math.max(0, this.stockManagement.currentStock - quantity);
  } else if (operation === 'add') {
    this.stockManagement.currentStock += quantity;
  } else if (operation === 'set') {
    this.stockManagement.currentStock = Math.max(0, quantity);
  }
  
  // Update out of stock status
  this.stockManagement.isOutOfStock = this.stockManagement.currentStock === 0;
  
  // Update availability if out of stock
  if (this.stockManagement.isOutOfStock) {
    this.isAvailable = false;
  }
  
  return this.save();
};

// Method: Increment order count
menuItemSchema.methods.incrementOrderCount = async function(quantity = 1) {
  this.orderCount += quantity;
  this.popularity += quantity;
  
  return this.save();
};

// Method: Update rating
menuItemSchema.methods.updateRating = async function(newRating) {
  const totalRating = (this.rating.average * this.rating.count) + newRating;
  this.rating.count += 1;
  this.rating.average = totalRating / this.rating.count;
  
  return this.save();
};

// Static method: Find popular items
menuItemSchema.statics.findPopular = function(restaurantId, limit = 10) {
  return this.find({
    restaurant: restaurantId,
    isAvailable: true
  })
  .sort({ popularity: -1, orderCount: -1 })
  .limit(limit);
};

// Static method: Find items by category
menuItemSchema.statics.findByCategory = function(restaurantId, category, includeUnavailable = false) {
  const query = { restaurant: restaurantId, category };
  if (!includeUnavailable) {
    query.isAvailable = true;
  }
  return this.find(query).sort({ displayOrder: 1, name: 1 });
};

// Static method: Find featured items
menuItemSchema.statics.findFeatured = function(restaurantId) {
  return this.find({
    restaurant: restaurantId,
    featured: true,
    isAvailable: true
  }).sort({ displayOrder: 1 });
};

// Static method: Search menu items
menuItemSchema.statics.searchItems = function(restaurantId, searchTerm) {
  return this.find({
    restaurant: restaurantId,
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $regex: searchTerm, $options: 'i' } }
    ]
  }).sort({ popularity: -1 });
};

// Pre-save middleware
menuItemSchema.pre('save', function(next) {
  // Auto-update out of stock status
  if (this.stockManagement.trackStock) {
    if (this.stockManagement.currentStock === 0) {
      this.stockManagement.isOutOfStock = true;
      this.isAvailable = false;
    } else {
      this.stockManagement.isOutOfStock = false;
    }
  }
  
  next();
});

// Pre-remove middleware to cleanup Cloudinary images
menuItemSchema.pre('remove', async function(next) {
  try {
    // Delete image from Cloudinary if exists
    if (this.image?.cloudinaryId) {
      const cloudinary = require('cloudinary').v2;
      await cloudinary.uploader.destroy(this.image.cloudinaryId);
      console.log('✅ Menu item image deleted from Cloudinary');
    }
    next();
  } catch (error) {
    console.error('⚠️ Error cleaning up Cloudinary image:', error);
    next(); // Continue even if cleanup fails
  }
});

// Pre-find middleware to auto-populate restaurant
menuItemSchema.pre(/^find/, function(next) {
  // Only populate if explicitly requested
  if (this.getOptions().populateRestaurant) {
    this.populate('restaurant', 'name cuisine');
  }
  next();
});

module.exports = mongoose.model('MenuItem', menuItemSchema);