const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const User = require('../models/User');

// Helper function to calculate percentage change
const calculatePercentageChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics from database
// @access  Private
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Get current date and date from last week
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Active Drivers (status: active)
    const activeDrivers = await Driver.countDocuments({ status: 'active' });
    const activeDriversLastWeek = await Driver.countDocuments({
      status: 'active',
      createdAt: { $lte: lastWeek }
    });
    const activeDriversChange = calculatePercentageChange(activeDrivers, activeDriversLastWeek);

    // Active Orders (status: confirmed, picked_up, in_transit)
    const activeOrders = await Order.countDocuments({
      status: { $in: ['confirmed', 'picked_up', 'in_transit'] }
    });
    const activeOrdersLastWeek = await Order.countDocuments({
      status: { $in: ['confirmed', 'picked_up', 'in_transit'] },
      createdAt: { $gte: twoWeeksAgo, $lte: lastWeek }
    });
    const activeOrdersChange = calculatePercentageChange(activeOrders, activeOrdersLastWeek);

    // Total Deliveries (all time)
    const totalDeliveries = await Delivery.countDocuments({ status: 'completed' });
    const totalDeliveriesLastWeek = await Delivery.countDocuments({
      status: 'completed',
      createdAt: { $lte: lastWeek }
    });
    const totalDeliveriesChange = calculatePercentageChange(totalDeliveries, totalDeliveriesLastWeek);

    // Ongoing Deliveries (status: assigned, ongoing)
    const ongoingDeliveries = await Delivery.countDocuments({
      status: { $in: ['assigned', 'ongoing'] }
    });
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ongoingDeliveriesYesterday = await Delivery.countDocuments({
      status: { $in: ['assigned', 'ongoing'] },
      createdAt: { $gte: yesterday, $lte: now }
    });
    const ongoingDeliveriesChange = calculatePercentageChange(ongoingDeliveries, ongoingDeliveriesYesterday);

    res.status(200).json({
      success: true,
      data: {
        activeDrivers,
        activeDriversChange: parseFloat(activeDriversChange.toFixed(1)),
        activeOrders,
        activeOrdersChange: parseFloat(activeOrdersChange.toFixed(1)),
        totalDeliveries,
        totalDeliveriesChange: parseFloat(totalDeliveriesChange.toFixed(1)),
        ongoingDeliveries,
        ongoingDeliveriesChange: parseFloat(ongoingDeliveriesChange.toFixed(1))
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
});

// @route   GET /api/dashboard/chart-data
// @desc    Get chart data for last 7 days
// @access  Private
router.get('/chart-data', authMiddleware, async (req, res) => {
  try {
    const chartData = [];
    const now = new Date();
    
    // Get data for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Count completed deliveries for this day
      const count = await Delivery.countDocuments({
        status: 'completed',
        endTime: { $gte: date, $lt: nextDate }
      });
      
      // Format date
      const dateStr = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        day: '2-digit', 
        month: 'short' 
      });
      
      chartData.push({
        date: dateStr,
        value: count
      });
    }

    res.status(200).json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Chart data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chart data',
      error: error.message
    });
  }
});

// @route   GET /api/dashboard/ai-suggestions
// @desc    Get AI-based suggestions based on data analysis
// @access  Private
router.get('/ai-suggestions', authMiddleware, async (req, res) => {
  try {
    const suggestions = [];

    // Analyze high-demand areas
    const ordersByZipCode = await Order.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'confirmed'] },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$deliveryAddress.zipCode',
          count: { $sum: 1 },
          city: { $first: '$deliveryAddress.city' },
          state: { $first: '$deliveryAddress.state' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    if (ordersByZipCode.length > 0) {
      const topArea = ordersByZipCode[0];
      suggestions.push({
        id: 1,
        title: `Increase fleet size in ${topArea._id}, ${topArea.city}, ${topArea.state}, United States`,
        description: `Demand is high in ${topArea._id}`,
        priority: 'high'
      });
    }

    // Check driver availability
    const activeDriversCount = await Driver.countDocuments({ status: 'active' });
    const activeOrdersCount = await Order.countDocuments({
      status: { $in: ['confirmed', 'picked_up', 'in_transit'] }
    });

    if (activeOrdersCount > activeDriversCount * 2) {
      suggestions.push({
        id: 2,
        title: 'Driver shortage detected',
        description: `${activeOrdersCount} active orders with only ${activeDriversCount} drivers available`,
        priority: 'high'
      });
    }

    // Analyze delivery times
    const avgDeliveryTime = await Delivery.aggregate([
      {
        $match: {
          status: 'completed',
          endTime: { $exists: true }
        }
      },
      {
        $project: {
          duration: {
            $divide: [
              { $subtract: ['$endTime', '$startTime'] },
              1000 * 60 // Convert to minutes
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);

    if (avgDeliveryTime.length > 0 && avgDeliveryTime[0].avgDuration > 45) {
      suggestions.push({
        id: 3,
        title: 'Optimize delivery routes',
        description: `Average delivery time is ${Math.round(avgDeliveryTime[0].avgDuration)} minutes. Route optimization could reduce this by 15-20%`,
        priority: 'medium'
      });
    }

    res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('AI suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching AI suggestions',
      error: error.message
    });
  }
});

module.exports = router;
