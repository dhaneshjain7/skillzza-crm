const express      = require('express');
const mongoose     = require('mongoose');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const { createServer } = require('http');
const { Server }   = require('socket.io');
const jwt          = require('jsonwebtoken');
require('dotenv').config();

const app        = express();
const httpServer = createServer(app);

//Socket.io
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId  = decoded.id;
    socket.role    = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (user: ${socket.userId})`);
  socket.join(`user_${socket.userId}`);

  socket.on('join_school',  (schoolId) => socket.join(`school_${schoolId}`));
  socket.on('leave_school', (schoolId) => socket.leave(`school_${schoolId}`));
  socket.on('typing', ({ schoolId, isTyping }) => {
    socket.to(`school_${schoolId}`).emit('user_typing', { userId: socket.userId, isTyping });
  });

  // Mark notification read via socket
  socket.on('notification_read', async (notificationId) => {
    try {
      const { Notification } = require('./models');
      await Notification.findByIdAndUpdate(notificationId, { isRead: true, readAt: new Date() });
    } catch (e) { console.error(e); }
  });

  socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

// ── Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));
app.set('io', io);

// ── Database 
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✓  MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err));

// ── Routes
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/schools',       require('./routes/schoolRoutes'));
app.use('/api/documents',     require('./routes/documentRoutes'));
app.use('/api/messages',      require('./routes/messageRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports',       require('./routes/reportRoutes'));
app.use('/api/admins',        require('./routes/adminRoutes'));
app.use('/api/ai',            require('./routes/aiRoutes'));

app.get('/', (req, res) => res.json({ message: 'Skillzza CRM API running', version: '1.0.0' }));

app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`✓  Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
);
// This line intentionally left blank - routes added below via sed
