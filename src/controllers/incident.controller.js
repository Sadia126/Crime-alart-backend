const Incident = require('../models/Incident');
const User = require('../models/User');
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
 * Get incidents with filtering and pagination.
 * Query params: category, district, upazila, status (default: verified, use status=all to return all statuses), page, limit, search
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getIncidents = async (req, res, next) => {
  try {
    const {
      category,
      district,
      upazila,
      status,
      page = 1,
      limit = 10,
      search,
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (district) query.district = district;
    if (upazila) query.upazila = upazila;
    if (status && status !== 'all') query.status = status;
    if (!status) query.status = 'verified';

    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const incidents = await Incident.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Hide reporter name if anonymous and user is not the reporter
    const processedIncidents = incidents.map((incident) => {
      if (incident.anonymous && req.user?.id !== incident.reporterId.toString()) {
        return { ...incident, reporterName: 'Anonymous' };
      }
      return incident;
    });

    const totalCount = await Incident.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: processedIncidents,
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
 * Get incidents reported by the current user.
 * Query params: status, page, limit
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMyIncidents = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { reporterId: req.user._id };
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const incidents = await Incident.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalCount = await Incident.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: incidents,
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
 * Get a single incident by ID.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getIncidentById = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id).populate(
      'moderatedBy',
      'name'
    );

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Hide reporter name if anonymous and user is not the reporter
    if (incident.anonymous && req.user?.id !== incident.reporterId.toString()) {
      incident.reporterName = 'Anonymous';
    }

    res.json({ success: true, data: incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * Create a new incident report.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createIncident = async (req, res, next) => {
  try {
    const {
      category,
      title,
      description,
      division,
      district,
      upazila,
      address,
      incidentDate,
      incidentTime,
      photos,
      anonymous,
      latitude,
      longitude,
      preciseAddress,
      locationMethod,
    } = req.body;

    // Validate required fields
    if (
      !category ||
      !title ||
      !description ||
      !division ||
      !district ||
      !upazila ||
      !incidentDate ||
      !incidentTime
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Check incidentDate is not in the future
    const incidentDateTime = new Date(incidentDate);
    if (incidentDateTime > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Incident date cannot be in the future',
      });
    }

    const parsedLatitude = parseCoordinate(latitude);
    const parsedLongitude = parseCoordinate(longitude);
    let incidentLocation = {};

    if (parsedLatitude !== undefined || parsedLongitude !== undefined) {
      if (parsedLatitude === undefined || parsedLongitude === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid coordinates' });
      }

      const validation = validateCoordinates(parsedLatitude, parsedLongitude);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      incidentLocation = {
        location: {
          type: 'Point',
          coordinates: [parsedLongitude, parsedLatitude],
        },
        preciseAddress: preciseAddress || '',
        hasMapLocation: true,
        locationMethod: locationMethod || 'manual_pin',
      };
    }

    // Create incident
    const incident = await Incident.create({
      reporterId: req.user._id,
      reporterName: anonymous ? req.user.name : req.user.name,
      anonymous: anonymous || false,
      category,
      title,
      description,
      division,
      district,
      upazila,
      address: address || '',
      incidentDate,
      incidentTime,
      photos: photos || [],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ...incidentLocation,
    });

    // Increment user's report count
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { reportCount: 1 } },
      { new: true }
    );

    await createNotificationsForAllUsers({
      senderId: req.user._id,
      senderName: req.user.name,
      senderAvatar: req.user.avatar || '',
      type: 'new_incident',
      title: `New Incident: ${incident.category.replace(/_/g, ' ')}`,
      message: `${req.user.name} reported a ${incident.category.replace(/_/g, ' ')} incident in ${incident.district}, ${incident.upazila}. "${incident.title}"`,
      link: `/incidents/${incident._id}`,
      referenceId: incident._id,
      referenceType: 'incident',
    });

    res.status(201).json({ success: true, data: incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * Update an incident report.
 * Only pending incidents can be edited by reporter or admin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Check ownership or admin
    const isOwner = incident.reporterId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own incidents',
      });
    }

    // Only allow edit if status is pending
    if (incident.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Only pending reports can be edited',
      });
    }

    // Update allowed fields
    const allowedFields = [
      'category',
      'title',
      'description',
      'address',
      'incidentDate',
      'incidentTime',
      'photos',
      'preciseAddress',
      'hasMapLocation',
      'locationMethod',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        incident[field] = req.body[field];
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

      incident.location = {
        type: 'Point',
        coordinates: [parsedLongitude, parsedLatitude],
      };
      incident.preciseAddress = req.body.preciseAddress || incident.preciseAddress || '';
      incident.hasMapLocation = true;
      incident.locationMethod = req.body.locationMethod || 'manual_pin';
    }

    // Validate incidentDate is not in the future
    if (req.body.incidentDate) {
      const incidentDateTime = new Date(req.body.incidentDate);
      if (incidentDateTime > new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Incident date cannot be in the future',
        });
      }
    }

    await incident.save();

    res.json({ success: true, data: incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * Delete an incident report.
 * Only reporter or admin can delete.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Check ownership or admin
    const isOwner = incident.reporterId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own incidents',
      });
    }

    await Incident.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Incident deleted' });
  } catch (err) {
    return next(err);
  }
};

/**
 * Update incident status (moderator/admin only).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getNearbyIncidents = async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 5000;
    const limit = parseInt(req.query.limit, 10) || 20;
    const category = req.query.category || null;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'lat and lng query params are required' });
    }

    const query = {
      status: 'verified',
      hasMapLocation: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      },
    };

    if (category) query.category = category;

    const incidents = await Incident.find(query)
      .limit(limit)
      .select('title category status district upazila location preciseAddress incidentDate incidentTime reporterName anonymous')
      .lean();

    const withDistance = incidents.map((inc) => ({
      ...inc,
      distanceMeters: calculateDistance(
        lat,
        lng,
        inc.location.coordinates[1],
        inc.location.coordinates[0]
      ),
    }));

    res.json({
      success: true,
      incidents: withDistance,
      count: withDistance.length,
      searchCenter: { lat, lng },
      radiusMeters: radius,
    });
  } catch (err) {
    return next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;

    // Validate status
    const validStatuses = ['pending', 'under_review', 'verified', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    // Require rejection reason if rejecting
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Update status and moderation info
    incident.status = status;
    incident.moderatedBy = req.user._id;
    incident.moderatedAt = new Date();

    if (status === 'rejected') {
      incident.rejectionReason = rejectionReason;

      // Increment reporter's rejected count
      await User.findByIdAndUpdate(
        incident.reporterId,
        { $inc: { rejectedCount: 1 } },
        { new: true }
      );
    }

    // Set expiresAt for verified incidents
    if (status === 'verified' && !incident.expiresAt) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      incident.expiresAt = thirtyDaysFromNow;
    }

    await incident.save();

    if (status === 'verified') {
      await createNotificationForUser({
        recipientId: incident.reporterId,
        senderId: req.user._id,
        senderName: req.user.name,
        senderAvatar: req.user.avatar || '',
        type: 'incident_verified',
        title: 'Your Report Was Verified ✅',
        message: `Your incident report "${incident.title}" has been verified and is now publicly visible.`,
        link: `/incidents/${incident._id}`,
        referenceId: incident._id,
        referenceType: 'incident',
      });
    }

    if (status === 'rejected') {
      await createNotificationForUser({
        recipientId: incident.reporterId,
        senderId: req.user._id,
        senderName: req.user.name,
        senderAvatar: req.user.avatar || '',
        type: 'incident_rejected',
        title: 'Your Report Was Rejected ❌',
        message: `Your incident report "${incident.title}" was rejected. Reason: ${rejectionReason}`,
        link: `/dashboard/my-reports`,
        referenceId: incident._id,
        referenceType: 'incident',
      });
    }

    res.json({ success: true, data: incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * Flag an incident report.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const flagIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Check if already flagged by this user
    const alreadyFlagged = incident.flaggedBy.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (alreadyFlagged) {
      return res.status(400).json({
        success: false,
        message: 'You have already flagged this incident',
      });
    }

    // Add user to flaggedBy and increment flagCount
    incident.flaggedBy.push(req.user._id);
    incident.flagCount += 1;

    // If flagCount >= 5, set status to under_review
    if (incident.flagCount >= 5) {
      incident.status = 'under_review';
    }

    await incident.save();

    res.json({
      success: true,
      message: 'Incident flagged',
      flagCount: incident.flagCount,
    });
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
  getIncidents,
  getMyIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
  getNearbyIncidents,
  updateStatus,
  flagIncident,
};
