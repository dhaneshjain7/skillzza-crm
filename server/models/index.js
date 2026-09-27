// Central model exports — import from here everywhere in the app
// e.g. const { User, School, ActivityLog } = require('../models');

const User                = require('./User');
const School              = require('./School');
const SchoolStatusHistory = require('./SchoolStatusHistory');
const Document            = require('./Document');
const Message             = require('./Message');
const Notification        = require('./Notification');
const ActivityLog         = require('./ActivityLog');
const AuditLog            = require('./AuditLog');
const RefreshToken        = require('./RefreshToken');
const Role                = require('./Role');
const Permission          = require('./Permission');
const Settings            = require('./Settings');
const AdminScoreHistory   = require('./AdminScoreHistory');
const DailyMetricSnapshot = require('./DailyMetricSnapshot');

module.exports = {
  User,
  School,
  SchoolStatusHistory,
  Document,
  Message,
  Notification,
  ActivityLog,
  AuditLog,
  RefreshToken,
  Role,
  Permission,
  Settings,
  AdminScoreHistory,
  DailyMetricSnapshot,
};
