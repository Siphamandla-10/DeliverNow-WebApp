// ✅ LOAD DOTENV FIRST
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL ERROR: JWT_SECRET is not defined in .env file');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log('🔐 JWT_SECRET: EXISTS (' + process.env.JWT_SECRET.length + ' chars)');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
} catch (err) {
  console.log('⚠️ Cloudinary not installed');
}

// Import routes AFTER dotenv
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const ordersRoutes = require('./routes/orders');
const driverRoutes = require('./routes/drivers');
const customersRoutes = require('./routes/customers');
const restaurantRoutes = require('./routes/restaurants');
const menuRoutes = require('./routes/menu');

const app = express();

// Cloudinary Configuration
if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configured');
}

// ✅ CORS Configuration - NOW READS FROM ENVIRONMENT VARIABLE
// Read from environment variable or use defaults
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:3000',
      'https://front-end-lake-one.vercel.app',
      'https://delivernow-admin-dashboard.onrender.com'
    ];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // ✅ Allow all Vercel deployment URLs (*.vercel.app)
    if (origin && origin.match(/^https:\/\/.*\.vercel\.app$/)) {
      return callback(null, true);
    }
    
    // ✅ Allow all Render deployment URLs (*.onrender.com)
    if (origin && origin.match(/^https:\/\/.*\.onrender\.com$/)) {
      return callback(null, true);
    }
    
    // Allow specific origins from the allowedOrigins list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Reject other origins
    const msg = 'The CORS policy for this site does not allow access from the specified Origin: ' + origin;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('✅ CORS configured for origins:', allowedOrigins);
console.log('✅ CORS also allows: All *.vercel.app and *.onrender.com domains');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log('📥 ' + req.method + ' ' + req.path);
  next();
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log('📊 Database:', mongoose.connection.name);
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);

console.log('✅ Routes registered:');
console.log('   - /api/auth');
console.log('   - /api/dashboard');
console.log('   - /api/orders');
console.log('   - /api/drivers');
console.log('   - /api/customers');
console.log('   - /api/restaurants');
console.log('   - /api/menu');

// Health check
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'DeliverNow Backend API is running',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      dashboard: '/api/dashboard',
      orders: '/api/orders',
      drivers: '/api/drivers',
      customers: '/api/customers',
      restaurants: '/api/restaurants',
      menu: '/api/menu'
    },
    cors: {
      allowedOrigins: allowedOrigins,
      allowsAllVercelDomains: true,
      allowsAllRenderDomains: true
    }
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Route not found: ' + req.method + ' ' + req.path);
  res.status(404).json({ 
    success: false, 
    message: 'Cannot ' + req.method + ' ' + req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('\n🚀 Server running on port ' + PORT);
  console.log('📍 API: http://localhost:' + PORT);
  console.log('🌍 Environment: ' + (process.env.NODE_ENV || 'development') + '\n');
});

module.exports = app;