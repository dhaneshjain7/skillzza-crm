const nodemailer = require('nodemailer');

// ── Transporter 
const createTransporter = () => {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// ── Email templates 
const TEMPLATES = {
  'Status Updated': (data) => ({
    subject: `School Status Updated — ${data.schoolName}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <div style="background:#1e3a5f;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;font-weight:800;letter-spacing:1px;">SKILLZZA CRM</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:1.1rem;margin:0 0 1rem;">Status Updated</h2>
          <p style="color:#475569;font-size:0.9rem;line-height:1.6;">The status for <strong>${data.schoolName}</strong> has been updated.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:1rem 0;display:flex;gap:12px;align-items:center;">
            <div style="text-align:center;flex:1;">
              <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Previous</div>
              <div style="font-weight:700;color:#475569;">${data.oldStatus || '—'}</div>
            </div>
            <div style="font-size:1.2rem;color:#94a3b8;">→</div>
            <div style="text-align:center;flex:1;">
              <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">New Status</div>
              <div style="font-weight:700;color:#1e3a5f;">${data.newStatus}</div>
            </div>
          </div>
          ${data.remarks ? `<p style="color:#64748b;font-size:0.85rem;font-style:italic;">Remarks: "${data.remarks}"</p>` : ''}
          <p style="color:#94a3b8;font-size:0.78rem;margin-top:2rem;">Updated by ${data.updatedBy} on ${new Date().toLocaleString('en-IN')}</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Skillzza CRM · Confidential · Do not forward</p>
        </div>
      </div>`,
  }),

  'New Message': (data) => ({
    subject: `New Message from ${data.senderName} — Skillzza CRM`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <div style="background:#1e3a5f;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;font-weight:800;letter-spacing:1px;">SKILLZZA CRM</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:1.1rem;margin:0 0 1rem;">💬 New Message</h2>
          <p style="color:#475569;font-size:0.9rem;">You have a new message from <strong>${data.senderName}</strong>:</p>
          <div style="background:#f8fafc;border-left:4px solid #1e3a5f;border-radius:0 8px 8px 0;padding:16px;margin:1rem 0;">
            <p style="color:#1e293b;font-size:0.9rem;margin:0;line-height:1.6;">${data.content}</p>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;">School: ${data.schoolName} · ${new Date().toLocaleString('en-IN')}</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Skillzza CRM · Confidential</p>
        </div>
      </div>`,
  }),

  'Document Uploaded': (data) => ({
    subject: `Document Uploaded — ${data.schoolName}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <div style="background:#1e3a5f;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;font-weight:800;letter-spacing:1px;">SKILLZZA CRM</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:1.1rem;margin:0 0 1rem;">📄 Document Uploaded</h2>
          <p style="color:#475569;font-size:0.9rem;"><strong>${data.schoolName}</strong> has uploaded a new document.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:1rem 0;">
            <div style="font-size:0.82rem;color:#64748b;">File: <strong style="color:#1e293b;">${data.fileName}</strong></div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:4px;">Type: <strong style="color:#1e293b;">${data.documentType}</strong></div>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;">${new Date().toLocaleString('en-IN')}</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Skillzza CRM · Confidential</p>
        </div>
      </div>`,
  }),

  'Admin Assigned': (data) => ({
    subject: `New School Assignment — ${data.schoolName}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <div style="background:#1e3a5f;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;font-weight:800;letter-spacing:1px;">SKILLZZA CRM</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:1.1rem;margin:0 0 1rem;">👤 New School Assignment</h2>
          <p style="color:#475569;font-size:0.9rem;line-height:1.6;">You have been assigned as the administrator for a new school:</p>
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:1rem 0;">
            <div style="font-size:1rem;font-weight:700;color:#1e3a5f;">${data.schoolName}</div>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;margin-top:2rem;">Assigned by ${data.assignedBy || 'Super Admin'} on ${new Date().toLocaleString('en-IN')}</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Skillzza CRM · Confidential · Do not forward</p>
        </div>
      </div>`,
  }),

  'Password Changed': (data) => ({
    subject: `Your Skillzza CRM Password Was Changed`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <div style="background:#1e3a5f;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;font-weight:800;letter-spacing:1px;">SKILLZZA CRM</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:1.1rem;margin:0 0 1rem;">🔑 Password Changed</h2>
          <p style="color:#475569;font-size:0.9rem;line-height:1.6;">Your Skillzza CRM account password was just changed successfully.</p>
          <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px;margin:1rem 0;">
            <p style="color:#991b1b;font-size:0.85rem;margin:0;">If you did not make this change, please contact your administrator immediately.</p>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;margin-top:2rem;">${new Date().toLocaleString('en-IN')}</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Skillzza CRM · Confidential · Do not forward</p>
        </div>
      </div>`,
  }),

  'default': (data) => ({
    subject: `Notification — ${data.title || 'Skillzza CRM'}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;">
        <h1 style="color:#1e3a5f;font-size:1.1rem;">SKILLZZA CRM</h1>
        <h2 style="color:#1e293b;font-size:1rem;">${data.title}</h2>
        <p style="color:#475569;">${data.message}</p>
        <p style="color:#94a3b8;font-size:0.78rem;">${new Date().toLocaleString('en-IN')}</p>
      </div>`,
  }),
};

// ── Send email 
const sendEmail = async ({ to, triggerType, data }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email skipped — no credentials] To: ${to}, Type: ${triggerType}`);
    return { skipped: true };
  }

  try {
    const template  = TEMPLATES[triggerType] || TEMPLATES['default'];
    const { subject, html } = template(data);
    const transporter = createTransporter();

    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME || 'Skillzza CRM'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`[Email sent] To: ${to}, Subject: ${subject}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Email failed] ${err.message}`);
    return { error: err.message };
  }
};

module.exports = { sendEmail };
