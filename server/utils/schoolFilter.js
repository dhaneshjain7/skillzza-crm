// Shared, whitelisted School query-filter builder — the single source of truth for
// what's a valid/safe filter. Used by both the manual UI filters (getSchools) and the
// AI natural-language query endpoint, so the LLM path can never touch fields or values
// outside exactly what the UI already allows.

const ACTIVITY_FIELDS = ['loiReceived', 'dcaisConfirmation', 'studentDataReceived', 'teachersDataReceived', 'hackathonRegistered', 'poeSubmitted', 'cpdTrainingDone'];

const SCHOOL_STATUSES = [
  'New', 'Contacted', 'LOI Pending', 'LOI Received', 'Verification',
  'Data Requested', 'Data Received', 'Rejected', 'Completed', 'Archived',
];

// `params`: { status, assignedAdmin, city, state, district, activity, isArchived, search }
//   activity — comma-separated "field:value" pairs, e.g. "loiReceived:Yes,hackathonRegistered:No"
// `user` — req.user, for role-based scoping (admin sees only their assigned schools)
const buildSchoolFilter = (params, user) => {
  const { status, assignedAdmin, city, state, district, activity, isArchived, search } = params;
  const filter = {};

  if (user.role === 'admin') {
    filter.assignedAdmin = user._id;
  } else if (user.role === 'school_user') {
    filter.schoolUser = user._id;
  }

  if (status && SCHOOL_STATUSES.includes(status)) filter.currentStatus = status;
  if (assignedAdmin) filter.assignedAdmin = assignedAdmin;
  if (city)     filter['address.city']     = new RegExp(city, 'i');
  if (state)    filter['address.state']    = new RegExp(state, 'i');
  if (district) filter['address.district'] = new RegExp(district, 'i');

  // Activity filter — multiple values for the same field are OR'd ($in); different
  // fields are AND'd (all must match).
  if (activity) {
    const grouped = {};
    activity.split(',').forEach(pair => {
      const [field, value] = pair.split(':');
      if (ACTIVITY_FIELDS.includes(field) && ['Yes', 'No'].includes(value)) {
        grouped[field] = grouped[field] || new Set();
        grouped[field].add(value);
      }
    });
    Object.entries(grouped).forEach(([field, values]) => {
      const arr = Array.from(values);
      if (arr.length >= 2) return; // both Yes and No checked for this field = no constraint
      // These fields default to 'No', but older documents saved before a field existed
      // never had it written to Mongo — a raw find() won't match those on 'No' even
      // though the UI displays them as 'No'. $in with null also matches missing fields.
      filter[field] = arr[0] === 'No' ? { $in: ['No', null] } : arr[0];
    });
  }

  if (isArchived === 'true' || isArchived === true)   filter.isArchived = true;
  else if (isArchived === 'false' || isArchived === false) filter.isArchived = false;

  if (search) {
    filter.$or = [
      { schoolName:         new RegExp(search, 'i') },
      { email:              new RegExp(search, 'i') },
      { phone:              new RegExp(search, 'i') },
      { udiseCode:          new RegExp(search, 'i') },
      { 'address.city':     new RegExp(search, 'i') },
      { 'address.state':    new RegExp(search, 'i') },
      { 'address.district': new RegExp(search, 'i') },
    ];
  }

  return filter;
};

module.exports = { buildSchoolFilter, ACTIVITY_FIELDS, SCHOOL_STATUSES };
