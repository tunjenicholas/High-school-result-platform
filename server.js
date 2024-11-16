const express = require('express');
const path = require('path');
const authController = require('./controllers/authController');
const resultController = require('./controllers/resultController');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const notificationController = require('./controllers/notificationController');
const adminController = require('./controllers/adminController');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Auth routes
app.post('/api/auth/login', authController.login);
// app.post('/api/login', authController.login);
app.post('/api/register', authenticateToken, authorizeRoles('admin'), authController.register);
app.post('/api/register-parent', authenticateToken, authorizeRoles('admin'), authController.registerParent);
app.get('/api/verify-email/:token', authController.verifyEmail);
app.post('/api/forgot-password', authController.forgotPassword);
app.post('/api/reset-password', authController.resetPassword);
app.put('/api/update-profile', authenticateToken, authController.updateProfile);
app.get('/api/user-profile', authenticateToken, authController.getUserProfile);
app.get('/api/parent-students', authenticateToken, authorizeRoles('parent'), authController.getParentStudents);

// Result management routes
app.post('/api/results', authenticateToken, authorizeRoles('teacher', 'admin'), resultController.addResult);
app.put('/api/results/:resultId', authenticateToken, authorizeRoles('teacher', 'admin'), resultController.updateResult);
app.get('/api/results/student/:userId', authenticateToken, authorizeRoles('student', 'parent', 'teacher', 'admin'), resultController.getStudentResults);
app.get('/api/results/class/:classId', authenticateToken, authorizeRoles('teacher', 'admin'), resultController.getClassResults);
app.get('/api/subjects', authenticateToken, resultController.getSubjects);
app.get('/api/classes', authenticateToken, resultController.getClasses);
app.get('/api/result-slip/:userId/:academicYear/:term', authenticateToken, authorizeRoles('student', 'parent', 'teacher', 'admin'), resultController.generateResultSlip);
app.get('/api/student-performance/:userId', authenticateToken, authorizeRoles('student', 'parent', 'teacher', 'admin'), resultController.getStudentPerformance);
app.get('/api/result-slip/:studentId/:term/:year', authenticateToken, resultController.generateResultSlip);

// Notifications Routes
app.get('/api/notifications', authenticateToken, notificationController.getNotifications);
app.put('/api/notifications/:notificationId', authenticateToken, notificationController.markNotificationAsRead);
app.get('/api/notifications/unread-count', authenticateToken, notificationController.getUnreadNotificationsCount);

// Admin routes
app.get('/api/admin/statistics', authenticateToken, adminController.getStatistics);
app.get('/api/admin/recent-activity', authenticateToken, adminController.getRecentActivity);
app.get('/api/admin/users', authenticateToken, adminController.getUsers);
app.post('/api/admin/users', authenticateToken, adminController.addUser);
app.put('/api/admin/users/:userId', authenticateToken, adminController.editUser);
app.delete('/api/admin/users/:userId', authenticateToken, adminController.deleteUser);
app.get('/api/admin/profile', authenticateToken, adminController.getProfile);
app.put('/api/admin/profile', authenticateToken, adminController.updateProfile);




// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});