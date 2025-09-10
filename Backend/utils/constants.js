module.exports = {
    ROLES: {
        ADMIN: 'admin',
        FACULTY: 'faculty',
        STUDENT: 'student',
    },
    USER_STATUS: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        LOCKED: 'locked',
    },
    SESSION_STATUS: {
        SCHEDULED: 'scheduled',
        LIVE: 'live',
        PAUSED: 'paused',
        ENDED: 'ended',
        CANCELLED: 'cancelled',
    },
    POLL_TYPES: {
        SINGLE_CHOICE: 'single_choice',
        MULTIPLE_CHOICE: 'multiple_choice',
        TEXT_RESPONSE: 'text_response',
        YES_NO: 'yes_no',
        RATING: 'rating',
    },
    ALERT_SEVERITY: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical',
    },
    NOTIFICATION_TYPES: {
        SESSION_START: 'session_start',
        SESSION_END: 'session_end',
        POLL_CREATED: 'poll_created',
        POLL_CLOSED: 'poll_closed',
        ALERT_RAISED: 'alert_raised',
        USER_JOINED: 'user_joined',
        USER_LEFT: 'user_left',
    },
    ENGAGEMENT_LEVELS: {
        HIGH: 'high',
        MEDIUM: 'medium',
        LOW: 'low',
    },
    DEFAULTS: {
        MAX_STUDENTS_PER_COLLEGE: 5000,
        MAX_FACULTY_PER_COLLEGE: 500,
        SESSION_MAX_DURATION_MINUTES: 180,
        POLL_MAX_OPTIONS: 10,
    },
};