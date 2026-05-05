const PERMISSIONS = {
  // Opportunities
  OPPS_CREATE:          'opps.create',
  OPPS_VIEW_OWN:        'opps.view_own',
  OPPS_VIEW_ALL:        'opps.view_all',
  OPPS_EDIT_OWN:        'opps.edit_own',
  OPPS_EDIT_ALL:        'opps.edit_all',
  OPPS_ASSIGN_SALESMAN: 'opps.assign_salesman',
  OPPS_ASSIGN_DESIGNER: 'opps.assign_designer',
  OPPS_CHANGE_STAGE:    'opps.change_stage',
  OPPS_CLOSE:           'opps.close',
  // Quotations
  QUOT_CREATE:          'quot.create',
  QUOT_REVIEW:          'quot.review',
  QUOT_APPROVE:         'quot.approve',
  QUOT_RELEASE:         'quot.release',
  QUOT_REQUEST_REVISION:'quot.request_revision',
  // Discounts
  DISC_APPLY_STANDARD:  'disc.apply_standard',
  DISC_APPROVE_OVERRIDE:'disc.approve_override',
  // Notes
  NOTE_CREATE_OWN:      'note.create_own',
  NOTE_ASSIGN_TASK:     'note.assign_task',
  NOTE_VIEW_TEAM:       'note.view_team',
  // Users & Roles
  USERS_CREATE:         'users.create',
  USERS_EDIT:           'users.edit',
  ROLES_MANAGE:         'roles.manage',
  // Settings & Reports
  SETTINGS_MANAGE:      'settings.manage',
  REPORTS_VIEW_ALL:     'reports.view_all',
};

module.exports = PERMISSIONS;
