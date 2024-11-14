const express = require('express');
const path = require('path');
const authController = require('./controllers/authController');
const { authenticateToken } = require('./middleware/auth');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', authController.login);
app.post('/api/register', authenticateToken, authController.register);
app.get('/api/verify-email/:token', authController.verifyEmail);
app.post('/api/forgot-password', authController.forgotPassword);
app.post('/api/reset-password', authController.resetPassword);
app.get('/api/user-profile', authenticateToken, authController.getUserProfile);

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the dashboard page
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});