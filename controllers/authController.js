const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for username: ${username}`);

  try {
      const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
      console.log(`Users found: ${users.length}`);

      if (users.length === 0) {
          console.log('No user found with this username');
          return res.status(401).json({ message: 'Invalid username or password' });
      }

      const user = users[0];
      console.log(`User found: ${user.username}, User Type: ${user.user_type}`);
      console.log(`Stored password hash: ${user.password_hash}`);
      
      if (!user.password_hash) {
          console.error('User found but password_hash is null or undefined');
          return res.status(401).json({ message: 'Invalid username or password' });
      }

      console.log(`Attempting to compare password: ${password} with hash: ${user.password_hash}`);
      const isMatch = await bcrypt.compare(password, user.password_hash);
      console.log(`Password match: ${isMatch}`);

      if (!isMatch) {
          console.error('Password does not match');
          return res.status(401).json({ message: 'Invalid username or password' });
      }

      const token = jwt.sign(
          { id: user.user_id, role: user.user_type },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
      );

      res.json({
          token,
          user: {
              id: user.user_id,
              fullName: user.full_name,
              username: user.username,
              role: user.user_type
          }
      });
  } catch (error) {
      console.error('Login error:', error);
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
    
    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [result] = await pool.query(
      'UPDATE Users SET password_hash = ?, reset_token = NULL WHERE user_id = ? AND reset_token = ?',
      [hashedPassword, decoded.userId, token]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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

exports.registerParent = async (req, res) => {
  try {
    const { email, password, fullName, studentIds } = req.body;
    
    // Check if email already exists
    const [existingUsers] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create parent user
    const [result] = await pool.query(
      'INSERT INTO Users (email, password_hash, full_name, user_type) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, fullName, 'parent']
    );

    const parentId = result.insertId;

    // Link parent to students
    for (const studentId of studentIds) {
      await pool.query(
        'INSERT INTO ParentStudent (parent_id, student_id) VALUES (?, ?)',
        [parentId, studentId]
      );
    }

    // Generate and send verification email
    const verificationToken = jwt.sign({ userId: parentId }, process.env.JWT_SECRET, { expiresIn: '1d' });
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({ message: 'Parent registered successfully. Please check your email to verify your account.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getParentStudents = async (req, res) => {
  try {
    const parentId = req.user.userId;
    const [students] = await pool.query(
      `SELECT u.user_id, u.full_name, u.email 
       FROM Users u 
       JOIN ParentStudent ps ON u.user_id = ps.student_id 
       WHERE ps.parent_id = ?`,
      [parentId]
    );
    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};