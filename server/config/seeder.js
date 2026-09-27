require('dotenv').config();
const mongoose = require('mongoose');
const { User, Role, Permission, Settings, School, SchoolStatusHistory } = require('../models');

const ROLES = [
  { name: 'superadmin',  displayName: 'Super Admin',  description: 'Full platform access, cannot be restricted' },
  { name: 'admin',       displayName: 'Admin',         description: 'School administrator — manages assigned schools only' },
  { name: 'school_user', displayName: 'School User',   description: 'Lowest privilege — views and updates own school only' },
];

const PERMISSIONS = [
  { role: 'superadmin',  feature: 'View All Schools',  access: 'Yes' },
  { role: 'superadmin',  feature: 'Manage Admin',      access: 'Yes' },
  { role: 'superadmin',  feature: 'Manage School',     access: 'Yes' },
  { role: 'superadmin',  feature: 'Update Status',     access: 'Yes' },
  { role: 'superadmin',  feature: 'Chat',              access: 'Yes' },
  { role: 'superadmin',  feature: 'Upload Documents',  access: 'Yes' },
  { role: 'superadmin',  feature: 'Reports',           access: 'Yes' },
  { role: 'superadmin',  feature: 'Activity Logs',     access: 'Yes' },
  { role: 'superadmin',  feature: 'Dashboard',         access: 'Yes' },

  { role: 'admin',       feature: 'View All Schools',  access: 'Assigned Only' },
  { role: 'admin',       feature: 'Manage Admin',      access: 'No' },
  { role: 'admin',       feature: 'Manage School',     access: 'Yes' },
  { role: 'admin',       feature: 'Update Status',     access: 'Yes' },
  { role: 'admin',       feature: 'Chat',              access: 'Yes' },
  { role: 'admin',       feature: 'Upload Documents',  access: 'Yes' },
  { role: 'admin',       feature: 'Reports',           access: 'Limited' },
  { role: 'admin',       feature: 'Activity Logs',     access: 'Assigned' },
  { role: 'admin',       feature: 'Dashboard',         access: 'Yes' },

  { role: 'school_user', feature: 'View All Schools',  access: 'No' },
  { role: 'school_user', feature: 'Manage Admin',      access: 'No' },
  { role: 'school_user', feature: 'Manage School',     access: 'No' },
  { role: 'school_user', feature: 'Update Status',     access: 'No' },
  { role: 'school_user', feature: 'Chat',              access: 'Yes' },
  { role: 'school_user', feature: 'Upload Documents',  access: 'Yes' },
  { role: 'school_user', feature: 'Reports',           access: 'Own' },
  { role: 'school_user', feature: 'Activity Logs',     access: 'Own' },
  { role: 'school_user', feature: 'Dashboard',         access: 'Yes' },
];

const DEFAULT_SETTINGS = [
  { key: 'platform.name',      value: 'Skillzza CRM',        label: 'Platform Name',        group: 'General',  isPublic: true  },
  { key: 'platform.logo',      value: null,                   label: 'Platform Logo URL',    group: 'General',  isPublic: true  },
  { key: 'email.from',         value: 'noreply@skillzza.com', label: 'From Email',           group: 'Email',    isPublic: false },
  { key: 'email.fromName',     value: 'Skillzza CRM',        label: 'From Name',            group: 'Email',    isPublic: false },
  { key: 'security.jwtExpiry', value: '1d',                   label: 'JWT Expiry',           group: 'Security', isPublic: false },
  { key: 'storage.maxFileMB',  value: 10,                     label: 'Max Upload Size (MB)', group: 'Storage',  isPublic: false },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  // ── Roles ──────────────────────────────────────────────────────────────────
  for (const role of ROLES) {
    await Role.findOneAndUpdate(
      { name: role.name },
      { $set: role },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log('✓  Roles seeded');

  // ── Permissions ───────────────────────────────────────────────────────────
  for (const perm of PERMISSIONS) {
    await Permission.findOneAndUpdate(
      { role: perm.role, feature: perm.feature },
      { $set: perm },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log('✓  Permissions seeded');

  // ── Settings ──────────────────────────────────────────────────────────────
  for (const setting of DEFAULT_SETTINGS) {
    await Settings.findOneAndUpdate(
      { key: setting.key },
      { $set: setting },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log('✓  Settings seeded\n');

  // ── SuperAdmin ────────────────────────────────────────────────────────────
  let superAdmin = await User.findOne({ role: 'superadmin' }).setOptions({ includeDeleted: true });
  if (!superAdmin) {
    superAdmin = await User.create({
      name:     'Super Admin',
      email:    'superadmin@skillzza.com',
      password: 'Admin@1234',
      role:     'superadmin',
      isActive: true,
    });
    console.log('✓  SuperAdmin created  →  superadmin@skillzza.com  /  Admin@1234');
    console.log('   ⚠️  Change this password after first login!\n');
  } else {
    console.log('✓  SuperAdmin already exists — skipped');
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  let adminUser = await User.findOne({ email: 'admin@skillzza.com' }).setOptions({ includeDeleted: true });
  if (!adminUser) {
    adminUser = await User.create({
      name:     'Rajesh Kumar',
      email:    'admin@skillzza.com',
      password: 'Admin@1234',
      role:     'admin',
      isActive: true,
      phone:    '9876543210',
    });
    console.log('✓  Admin created       →  admin@skillzza.com  /  Admin@1234');
  } else {
    console.log('✓  Admin already exists — skipped');
    adminUser = await User.findOne({ email: 'admin@skillzza.com' });
  }

  // ── School User ───────────────────────────────────────────────────────────
  let schoolUser = await User.findOne({ email: 'school@skillzza.com' }).setOptions({ includeDeleted: true });
  if (!schoolUser) {
    schoolUser = await User.create({
      name:     'DPS Principal',
      email:    'school@skillzza.com',
      password: 'School@1234',
      role:     'school_user',
      isActive: true,
      phone:    '9123456780',
    });
    console.log('✓  SchoolUser created  →  school@skillzza.com  /  School@1234');
  } else {
    console.log('✓  SchoolUser already exists — skipped');
    schoolUser = await User.findOne({ email: 'school@skillzza.com' });
  }

  // ── School (linked to admin + school_user) ────────────────────────────────
  let school = await School.findOne({ email: 'dps@skillzza.com' });
  if (!school) {
    school = await School.create({
      schoolName:    'Delhi Public School',
      udiseCode:     '10123456789', // placeholder — udiseCode is required at the schema level; real schools get a real 11-digit code on creation/import
      email:         'dps@skillzza.com',
      phone:         '0112345678',
      schoolType:    'Secondary',
      board:         'CBSE',
      currentStatus: 'New',
      assignedAdmin: adminUser._id,
      schoolUser:    schoolUser._id,
      address: {
        city:     'New Delhi',
        state:    'Delhi',
        district: 'Central Delhi',
        pincode:  '110001',
      },
      principal: {
        name:  'DPS Principal',
        email: 'school@skillzza.com',
        phone: '9123456780',
      },
    });

    // First status history entry
    await SchoolStatusHistory.create({
      school:        school._id,
      oldStatus:     null,
      newStatus:     'New',
      updatedBy:     adminUser._id,
      updatedByRole: 'admin',
      remarks:       'School created via seeder',
    });

    console.log('✓  School created      →  Delhi Public School');
    console.log(`   Assigned Admin: ${adminUser.name} (${adminUser.email})`);
    console.log(`   School User:    ${schoolUser.name} (${schoolUser.email})\n`);
  } else {
    console.log('✓  School already exists — skipped');
  }

  console.log('\n── Login Credentials ─────────────────────────────────');
  console.log('  SuperAdmin  →  superadmin@skillzza.com  /  Admin@1234');
  console.log('  Admin       →  admin@skillzza.com       /  Admin@1234');
  console.log('  SchoolUser  →  school@skillzza.com      /  School@1234');
  console.log('──────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('Seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeder error:', err);
  process.exit(1);
});