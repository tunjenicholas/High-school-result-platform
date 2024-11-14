const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const [roles] = await pool.query('SELECT role_name FROM Roles r JOIN UserRoles ur ON r.role_id = ur.role_id WHERE ur.user_id = ?', [user.user_id]);
    const isAdmin = roles.some(role => role.role_name === 'admin');

    if (!user.is_verified && !isAdmin) {
      if (!user.verification_token) {
        const verificationToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
        await pool.query('UPDATE Users SET verification_token = ? WHERE user_id = ?', [verificationToken, user.user_id]);
        await sendVerificationEmail(user.email, verificationToken);
        return res.status(401).json({ message: 'Your account is not verified. A new verification email has been sent.' });
      }
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    await pool.query('UPDATE Users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, userId: user.user_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, email, password, fullName, role } = req.body;
    
    const [adminUser] = await pool.query('SELECT role_id FROM UserRoles WHERE user_id = ?', [req.user.userId]);
    if (adminUser.length === 0 || adminUser[0].role_id !== 1) {
      return res.status(403).json({ message: 'Only administrators can register new users' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    const [result] = await pool.query(
      'INSERT INTO Users (username, email, password_hash, full_name, verification_token, is_verified) VALUES (?, ?, ?, ?, ?, FALSE)',
      [username, email, hashedPassword, fullName, verificationToken]
    );

    const userId = result.insertId;
    
    const [roles] = await pool.query('SELECT role_id FROM Roles WHERE role_name = ?', [role]);
    if (roles.length === 0) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const roleId = roles[0].role_id;

    await pool.query('INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);

    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({ message: 'User registered successfully. Please check your email to verify your account.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [result] = await pool.query(
      'UPDATE Users SET is_verified = TRUE, verification_token = NULL WHERE email = ? AND verification_token = ?',
      [decoded.email, token]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Invalid or expired verification token' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = users[0];
    const resetToken = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    await pool.query('UPDATE Users SET reset_token = ? WHERE user_id = ?', [resetToken, user.user_id]);
    
    try {
      await sendPasswordResetEmail(email, resetToken);
      res.json({ message: 'Password reset email sent' });
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      res.status(500).json({ message: 'Failed to send password reset email. Please try again later or contact support.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [result] = await pool.query(
      'UPDATE Users SET password_hash = ?, reset_token = NULL WHERE user_id = ? AND reset_token = ?',
      [hashedPassword, decoded.userId, token]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Invalid or expired reset token' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, email } = req.body;

    const [result] = await pool.query(
      'UPDATE Users SET full_name = ?, email = ? WHERE user_id = ?',
      [fullName, email, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT user_id, username, email, full_name FROM Users WHERE user_id = ?', [req.user.userId]);

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};