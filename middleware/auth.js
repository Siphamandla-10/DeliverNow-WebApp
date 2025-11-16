// middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');

// ✅ Just get the JWT_SECRET - don't validate here
const JWT_SECRET = process.env.JWT_SECRET;

// ========================================
// ADMIN AUTH MIDDLEWARE (for admin dashboard)
// ========================================
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided. Authorization denied.' 
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Try to find admin first
    let admin = await Admin.findById(decoded.id || decoded.adminId).select('-password');
    
    if (!admin) {
      // If not found in Admin, try User model (for flexibility)
      const user = await User.findById(decoded.userId || decoded.id).select('-password');
      if (user) {
        admin = user;
      }
    }
    
    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }

    // Attach admin to request
    req.admin = admin;
    req.user = admin; // Also attach as user for compatibility
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error in authentication' 
    });
  }
};

// ========================================
// USER AUTH MIDDLEWARE (for multi-role users)
// ========================================
const userAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided. Authorization denied.' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId || decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated. Please contact support.' 
      });
    }

    req.user = user;
    
    // Also attach as specific role for backwards compatibility
    if (user.userType === 'admin') req.admin = user;
    if (user.userType === 'vendor') req.vendor = user;
    if (user.userType === 'driver') req.driver = user;
    if (user.userType === 'customer') req.customer = user;
    
    next();
  } catch (error) {
    console.error('User auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error in authentication' 
    });
  }
};

// ========================================
// ADMIN ONLY MIDDLEWARE
// ========================================
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user && !req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const user = req.user || req.admin;

    if (user.userType && user.userType !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error in admin authorization' 
    });
  }
};

// ========================================
// VENDOR ONLY MIDDLEWARE
// ========================================
const vendorMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (req.user.userType !== 'vendor') {
      return res.status(403).json({ 
        success: false, 
        message: 'Vendor access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Vendor middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error in vendor authorization' 
    });
  }
};

// ========================================
// DRIVER ONLY MIDDLEWARE
// ========================================
const driverMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (req.user.userType !== 'driver') {
      return res.status(403).json({ 
        success: false, 
        message: 'Driver access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Driver middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error in driver authorization' 
    });
  }
};

// ========================================
// CUSTOMER ONLY MIDDLEWARE
// ========================================
const customerMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (req.user.userType !== 'customer') {
      return res.status(403).json({ 
        success: false, 
        message: 'Customer access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Customer middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error in customer authorization' 
    });
  }
};

// ========================================
// MULTI-ROLE MIDDLEWARE
// ========================================
const requireRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }

      if (!allowedRoles.includes(req.user.userType)) {
        return res.status(403).json({ 
          success: false, 
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
        });
      }

      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error in role authorization' 
      });
    }
  };
};

// ========================================
// OPTIONAL AUTH MIDDLEWARE
// ========================================
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id).select('-password');
    
    req.user = user || null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Export default as authMiddleware (for admin dashboard)
module.exports = authMiddleware;

// Export all middleware as named exports
module.exports.authMiddleware = authMiddleware;
module.exports.userAuthMiddleware = userAuthMiddleware;
module.exports.adminMiddleware = adminMiddleware;
module.exports.vendorMiddleware = vendorMiddleware;
module.exports.driverMiddleware = driverMiddleware;
module.exports.customerMiddleware = customerMiddleware;
module.exports.requireRoles = requireRoles;
module.exports.optionalAuth = optionalAuth;