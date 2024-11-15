const jwt = require('jsonwebtoken');
const pool = require('../config/database');

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

exports.authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const [users] = await pool.query('SELECT user_type FROM Users WHERE user_id = ?', [req.user.userId]);
      
      if (users.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userRole = users[0].user_type;

      if (allowedRoles.includes(userRole)) {
        next();
      } else {
        res.status(403).json({ message: 'Access denied' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};