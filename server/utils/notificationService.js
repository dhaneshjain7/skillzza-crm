const { Notification, User } = require('../models');
const { sendEmail }          = require('./emailService');

//createNotification
// Central function — call this from any controller to fire a notification
const createNotification = async ({
  recipientId,
  recipientRole,
  triggerType,
  title,
  message,
  relatedSchool  = null,
  relatedMessage = null,
  relatedDocument= null,
  sendEmailFlag  = false,
  emailData      = {},
  io             = null,  // socket.io instance
}) => {
  try {
    // 1. Save to DB
    const notification = await Notification.create({
      recipient:       recipientId,
      recipientRole,
      triggerType,
      title,
      message,
      relatedSchool,
      relatedMessage,
      relatedDocument,
      channels: {
        system: true,
        email:  sendEmailFlag,
      },
    });

    // 2. Emit via Socket.io (real-time)
    if (io) {
      io.to(`user_${recipientId}`).emit('new_notification', {
        _id:         notification._id,
        triggerType,
        title,
        message,
        isRead:      false,
        createdAt:   notification.createdAt,
        relatedSchool,
      });
    }

    // 3. Send email if requested — fire-and-forget. Awaiting an SMTP round
    // trip here would make the response of whatever action triggered this
    // notification (e.g. sending a chat message) wait on it too, and a slow
    // or stalled SMTP connection (common on a cold serverless connection)
    // would then surface as a false "failed" error on an action that
    // actually already succeeded.
    if (sendEmailFlag) {
      User.findById(recipientId).select('email notificationPrefs')
        .then(async (recipient) => {
          if (recipient?.notificationPrefs?.email === false) return;
          const result = await sendEmail({
            to:          recipient.email,
            triggerType,
            data:        { title, message, ...emailData },
          });
          if (result.sent) {
            notification.emailSent   = true;
            notification.emailSentAt = new Date();
            await notification.save();
          }
        })
        .catch((err) => console.error('createNotification email error:', err.message));
    }

    return notification;
  } catch (err) {
    console.error('createNotification error:', err.message);
    return null;
  }
};

// ── Trigger helpers — call these from controllers

const notifyStatusUpdate = async ({ school, oldStatus, newStatus, remarks, updatedBy, io }) => {
  // Notify school user
  if (school.schoolUser) {
    await createNotification({
      recipientId:   school.schoolUser,
      recipientRole: 'school_user',
      triggerType:   'Status Updated',
      title:         `Your school status has been updated`,
      message:       `Status changed from "${oldStatus || 'New'}" to "${newStatus}"${remarks ? `: ${remarks}` : ''}`,
      relatedSchool: school._id,
      sendEmailFlag: true,
      emailData: {
        schoolName: school.schoolName,
        oldStatus,
        newStatus,
        remarks,
        updatedBy:  updatedBy.name,
      },
      io,
    });
  }
};

const notifyDocumentUploaded = async ({ school, document, uploadedBy, io }) => {
  // Notify assigned admin
  if (school.assignedAdmin) {
    await createNotification({
      recipientId:    school.assignedAdmin,
      recipientRole:  'admin',
      triggerType:    'Document Uploaded',
      title:          `New document uploaded by ${school.schoolName}`,
      message:        `${document.fileName} has been uploaded and is pending review`,
      relatedSchool:  school._id,
      relatedDocument:document._id,
      sendEmailFlag:  true,
      emailData: {
        schoolName:   school.schoolName,
        fileName:     document.fileName,
        documentType: document.documentType,
      },
      io,
    });
  }
};

const notifyAdminAssigned = async ({ school, admin, assignedBy, io }) => {
  await createNotification({
    recipientId:   admin._id,
    recipientRole: 'admin',
    triggerType:   'Admin Assigned',
    title:         `You have been assigned to ${school.schoolName}`,
    message:       `${assignedBy.name} has assigned you as the administrator for ${school.schoolName}`,
    relatedSchool: school._id,
    sendEmailFlag: true,
    emailData: {
      title:      `New School Assignment`,
      message:    `You have been assigned to manage ${school.schoolName}`,
      schoolName: school.schoolName,
      assignedBy: assignedBy.name,
    },
    io,
  });
};

// Admin/superadmin uploaded a file FOR a school (e.g. Adobe account credentials)
const notifyDocumentSent = async ({ school, document, sentBy, io }) => {
  if (school.schoolUser) {
    await createNotification({
      recipientId:    school.schoolUser,
      recipientRole:  'school_user',
      triggerType:    'Document Uploaded',
      title:          'A new file has been shared with your school',
      message:        `${sentBy.name} shared "${document.fileName}" with ${school.schoolName}. You can view and download it from the Documents page.`,
      relatedSchool:  school._id,
      relatedDocument: document._id,
      sendEmailFlag:  true,
      emailData: {
        schoolName:   school.schoolName,
        fileName:     document.fileName,
        documentType: document.documentType,
      },
      io,
    });
  }
};

// Notify every superadmin whenever a new school is created — via the Add
// School modal, bulk import, self-registration, or first-time Google sign-in.
const notifySchoolCreated = async ({ school, createdByLabel, io }) => {
  // Never let a notification hiccup break the school-creation flow that
  // triggered it — same "swallow and log" contract as createNotification.
  try {
    const superAdmins = await User.find({ role: 'superadmin', isActive: true }).select('_id');
    await Promise.all(superAdmins.map(sa => createNotification({
      recipientId:   sa._id,
      recipientRole: 'superadmin',
      triggerType:   'School Created',
      title:         `New school added: ${school.schoolName}`,
      message:       `${school.schoolName} was added${createdByLabel ? ` (${createdByLabel})` : ''}.`,
      relatedSchool: school._id,
      io,
    })));
  } catch (err) {
    console.error('notifySchoolCreated error:', err.message);
  }
};

const notifyPasswordChanged = async ({ user, io }) => {
  await createNotification({
    recipientId:   user._id,
    recipientRole: user.role,
    triggerType:   'Password Changed',
    title:         'Your password was changed',
    message:       'Your Skillzza CRM password was successfully changed. If this wasn\'t you, contact support immediately.',
    sendEmailFlag: true,
    emailData: {
      title:   'Password Changed',
      message: 'Your password was changed successfully.',
    },
    io,
  });
};

module.exports = {
  createNotification,
  notifyStatusUpdate,
  notifyDocumentUploaded,
  notifyDocumentSent,
  notifyAdminAssigned,
  notifySchoolCreated,
  notifyPasswordChanged,
};
