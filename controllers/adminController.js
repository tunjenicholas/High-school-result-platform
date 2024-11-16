const pool = require('../config/database');

exports.getStatistics = async (req, res) => {
    try {
        const [results] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM Users) as totalUsers,
                (SELECT COUNT(*) FROM Users WHERE user_type = 'student') as totalStudents,
                (SELECT COUNT(*) FROM Users WHERE user_type = 'teacher') as totalTeachers,
                (SELECT COUNT(*) FROM Users WHERE user_type = 'parent') as totalParents
        `);
        res.json(results[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getRecentActivity = async (req, res) => {
    try {
        const [activities] = await pool.query('SELECT * FROM ActivityLog ORDER BY timestamp DESC LIMIT 10');
        res.json(activities);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT user_id, full_name, email, user_type FROM Users');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.addUser = async (req, res) => {
    const { full_name, email, user_type, password } = req.body;
    try {
        const [result] = await pool.query('INSERT INTO Users (full_name, email, user_type, password) VALUES (?, ?, ?, ?)', [full_name, email, user_type, password]);
        res.status(201).json({ message: 'User created successfully', userId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.editUser = async (req, res) => {
    const { userId } = req.params;
    const { full_name, email, user_type } = req.body;
    try {
        await pool.query('UPDATE Users SET full_name = ?, email = ?, user_type = ? WHERE user_id = ?', [full_name, email, user_type, userId]);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    try {
        await pool.query('DELETE FROM Users WHERE user_id = ?', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const [user] = await pool.query('SELECT user_id, full_name, email, user_type FROM Users WHERE user_id = ?', [req.user.id]);
        if (user.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateProfile = async (req, res) => {
    const { full_name, email } = req.body;
    try {
        await pool.query('UPDATE Users SET full_name = ?, email = ? WHERE user_id = ?', [full_name, email, req.user.id]);
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};