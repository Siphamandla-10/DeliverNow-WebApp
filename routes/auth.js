const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET;

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;

    if (!name || !surname || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide name, surname, email and password' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    const admin = new Admin({
      name: name.trim(),
      surname: surname.trim(),
      email: email.toLowerCase().trim(),
      password
    });

    await admin.save();
    console.log('✅ Admin created:', admin.email);

    const token = jwt.sign(
      { 
        id: admin._id,
        adminId: admin._id,
        email: admin.email 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        surname: admin.surname,
        email: admin.email,
        createdAt: admin.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: error.message 
    });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const isPasswordValid = await admin.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const token = jwt.sign(
      { 
        id: admin._id,
        adminId: admin._id,
        email: admin.email 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Login successful:', admin.email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        surname: admin.surname,
        email: admin.email,
        createdAt: admin.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed', 
      error: error.message 
    });
  }
});

// VERIFY TOKEN
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id || decoded.adminId).select('-password');

    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        surname: admin.surname,
        email: admin.email,
        createdAt: admin.createdAt
      }
    });

  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
});

module.exports = router;