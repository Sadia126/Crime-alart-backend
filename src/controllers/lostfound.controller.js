const LostFound = require('../models/LostFound');
const {
  createNotificationsForAllUsers,
  createNotificationForUser,
} = require('../utils/notificationHelper');

/**
 * Parse a coordinate value safely from request input.
 * @param {string|number} value
 * @returns {number|undefined}
 */
const parseCoordinate = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

/**
 * Validate latitude and longitude values.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{valid:boolean,message:string}}
 */
const validateCoordinates = (latitude, longitude) => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { valid: false, message: 'Invalid coordinates' };
  }
  if (latitude < -90 || latitude > 90) {
    return { valid: false, message: 'Latitude must be between -90 and 90' };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, message: 'Longitude must be between -180 and 180' };
  }
  return { valid: true, message: '' };
};

/**
 * Get all lost & found posts with filtering and pagination.
 * Query params: type, district, status (default: 'active'), page, limit, search (itemName)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getAllPosts = async (req, res, next) => {
  try {
    const { type, district, status = 'active', page = 1, limit = 10, search } = req.query;

    const query = {};

    if (type) query.type = type;
    if (district) query.district = district;
    // Support requesting all statuses from admin by passing status=all
    if (status && status !== 'all') query.status = status;

    if (search) {
      query.itemName = { $regex: search, $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const posts = await LostFound.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Strip contactNumber if showContact is false
    const processedPosts = posts.map((post) => {
      if (!post.showContact) {
        const { contactNumber, ...rest } = post;
        return rest;
      }
      return post;
    });

    const totalCount = await LostFound.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: processedPosts,
      pagination: {
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get posts created by the current user.
 * Query params: status, page, limit
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMyPosts = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId: req.user._id };
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const posts = await LostFound.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalCount = await LostFound.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: posts,
      pagination: {
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get a single post by ID.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getPostById = async (req, res, next) => {
  try {
    const post = await LostFound.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Strip contactNumber if showContact is false and user is not the owner
    const isOwner = post.userId.toString() === req.user._id.toString();

    if (!post.showContact && !isOwner) {
      const { contactNumber, ...postData } = post.toObject();
      return res.json({ success: true, data: postData });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    return next(err);
  }
};

/**
 * Create a new lost & found post.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createPost = async (req, res, next) => {
  try {
    const {
      type,
      itemName,
      category,
      description,
      photo,
      division,
      district,
      upazila,
      exactPlace,
      dateLostFound,
      showContact,
      contactNumber,
      latitude,
      longitude,
      preciseAddress,
      locationMethod,
    } = req.body;

    // Validate required fields
    if (!type || !itemName || !category || !description || !district || !upazila || !dateLostFound) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: type, itemName, category, description, district, upazila, dateLostFound',
      });
    }

    const parsedLatitude = parseCoordinate(latitude);
    const parsedLongitude = parseCoordinate(longitude);
    let locationData = {};

    if (parsedLatitude !== undefined || parsedLongitude !== undefined) {
      if (parsedLatitude === undefined || parsedLongitude === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid coordinates' });
      }

      const validation = validateCoordinates(parsedLatitude, parsedLongitude);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      locationData = {
        location: {
          type: 'Point',
          coordinates: [parsedLongitude, parsedLatitude],
        },
        preciseAddress: preciseAddress || '',
        hasMapLocation: true,
        locationMethod: locationMethod || 'manual_pin',
      };
    }

    // Create post
    const post = await LostFound.create({
      userId: req.user._id,
      userName: req.user.name,
      type,
      itemName,
      category,
      description,
      photo: photo || '',
      division: division || '',
      district,
      upazila,
      exactPlace: exactPlace || '',
      dateLostFound,
      showContact: showContact || false,
      contactNumber: showContact ? contactNumber || '' : '',
      ...locationData,
    });

    await createNotificationsForAllUsers({
      senderId: req.user._id,
      senderName: req.user.name,
      senderAvatar: req.user.avatar || '',
      type: 'new_lost_found',
      title: `${post.type === 'lost' ? '🔍 Lost Item' : '✅ Found Item'}: ${post.itemName}`,
      message: `${req.user.name} posted a ${post.type} item — "${post.itemName}" in ${post.district}, ${post.upazila}.`,
      link: `/lost-found/${post._id}`,
      referenceId: post._id,
      referenceType: 'lost_found',
    });

    res.status(201).json({ success: true, data: post });
  } catch (err) {
    return next(err);
  }
};

/**
 * Update a lost & found post.
 * Only active posts can be updated. Check ownership or admin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updatePost = async (req, res, next) => {
  try {
    const post = await LostFound.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check ownership or admin
    const isOwner = post.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own posts',
      });
    }

    // Only active posts can be edited
    if (post.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Only active posts can be edited',
      });
    }

    // Update allowed fields
    const allowedFields = [
      'type',
      'itemName',
      'category',
      'description',
      'photo',
      'exactPlace',
      'dateLostFound',
      'showContact',
      'contactNumber',
      'preciseAddress',
      'hasMapLocation',
      'locationMethod',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        post[field] = req.body[field];
      }
    });

    const parsedLatitude = parseCoordinate(req.body.latitude);
    const parsedLongitude = parseCoordinate(req.body.longitude);

    if (parsedLatitude !== undefined || parsedLongitude !== undefined) {
      if (parsedLatitude === undefined || parsedLongitude === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid coordinates' });
      }

      const validation = validateCoordinates(parsedLatitude, parsedLongitude);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      post.location = {
        type: 'Point',
        coordinates: [parsedLongitude, parsedLatitude],
      };
      post.preciseAddress = req.body.preciseAddress || post.preciseAddress || '';
      post.hasMapLocation = true;
      post.locationMethod = req.body.locationMethod || 'manual_pin';
    }

    // If showContact is false, clear contactNumber
    if (req.body.showContact === false) {
      post.contactNumber = '';
    }

    await post.save();

    res.json({ success: true, data: post });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/lost-found/nearby
 * Find active lost & found posts near a given coordinate.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getNearbyPosts = async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 5000;
    const limit = parseInt(req.query.limit, 10) || 20;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'lat and lng query params are required' });
    }

    const query = {
      status: 'active',
      hasMapLocation: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      },
    };

    const posts = await LostFound.find(query)
      .limit(limit)
      .select('type itemName category status district upazila location preciseAddress dateLostFound userName')
      .lean();

    const withDistance = posts.map((post) => ({
      ...post,
      distanceMeters: calculateDistance(
        lat,
        lng,
        post.location.coordinates[1],
        post.location.coordinates[0]
      ),
    }));

    res.json({
      success: true,
      posts: withDistance,
      count: withDistance.length,
      searchCenter: { lat, lng },
      radiusMeters: radius,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Mark a post as resolved.
 * Check ownership or admin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const markResolved = async (req, res, next) => {
  try {
    const post = await LostFound.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check ownership or admin
    const isOwner = post.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only resolve your own posts',
      });
    }

    // Mark as resolved
    post.status = 'resolved';
    await post.save();

    await createNotificationForUser({
      recipientId: post.userId,
      senderId: req.user._id,
      senderName: req.user.name,
      senderAvatar: req.user.avatar || '',
      type: 'lost_found_resolved',
      title: 'Lost & Found Post Resolved ✅',
      message: `Your post for "${post.itemName}" has been marked as resolved.`,
      link: `/dashboard/my-lost-found`,
      referenceId: post._id,
      referenceType: 'lost_found',
    });

    res.json({ success: true, data: post });
  } catch (err) {
    return next(err);
  }
};

/**
 * Delete a lost & found post.
 * Check ownership or admin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deletePost = async (req, res, next) => {
  try {
    const post = await LostFound.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check ownership or admin
    const isOwner = post.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own posts',
      });
    }

    await LostFound.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    return next(err);
  }
};

/**
 * Haversine distance formula helper.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

module.exports = {
  getAllPosts,
  getMyPosts,
  getPostById,
  createPost,
  updatePost,
  getNearbyPosts,
  markResolved,
  deletePost,
};
