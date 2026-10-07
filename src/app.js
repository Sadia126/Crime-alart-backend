const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const incidentRoutes = require('./routes/incident.routes');
const lostFoundRoutes = require('./routes/lostfound.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const notificationRoutes = require('./routes/notification.routes');
const statsRoutes = require('./routes/stats.routes');
const errorHandler = require('./middlewares/errorHandler');

const connectDB = require('./config/db');

const app = express();

const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://crimealart.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps or curl)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // fallback allow for seamless cross-origin communication
    },
    credentials: true,
  })
);

// Ensure database is connected for serverless environments (e.g. Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/lost-found', lostFoundRoutes);
app.use('/api/emergency-contacts', emergencyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);

app.use(errorHandler);

module.exports = app;
