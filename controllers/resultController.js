const pool = require('../config/database');
const PDFDocument = require('pdfkit');
const { validateResult } = require('../middleware/validation');
const { createNotification } = require('./notificationController');
const { calculateGrade, calculateGradePoints } = require('../utils/grading');

exports.addResult = [
    validateResult,
    async (req, res) => {
        const { studentClassId, subjectId, score, term, academicYear } = req.body;
        const grade = calculateGrade(score);

        try {
            await pool.query('START TRANSACTION');

            // Insert the result
            const [result] = await pool.query(
                'INSERT INTO Results (student_class_id, subject_id, score, grade, term, academic_year) VALUES (?, ?, ?, ?, ?, ?)',
                [studentClassId, subjectId, score, grade, term, academicYear]
            );

            // Check if all subjects for this student in this term and year have results
            const [allSubjectsCount] = await pool.query(
                'SELECT COUNT(*) as count FROM Subjects WHERE subject_id IN (SELECT subject_id FROM StudentClasses WHERE student_class_id = ?)',
                [studentClassId]
            );

            const [resultsCount] = await pool.query(
                'SELECT COUNT(*) as count FROM Results WHERE student_class_id = ? AND term = ? AND academic_year = ?',
                [studentClassId, term, academicYear]
            );

            if (allSubjectsCount[0].count === resultsCount[0].count) {
                // All subjects have results, calculate overall performance
                const [studentInfo] = await pool.query(
                    'SELECT u.user_id, u.full_name FROM Users u JOIN StudentClasses sc ON u.user_id = sc.user_id WHERE sc.student_class_id = ?',
                    [studentClassId]
                );

                const [results] = await pool.query(
                    'SELECT AVG(score) as average_score FROM Results WHERE student_class_id = ? AND term = ? AND academic_year = ?',
                    [studentClassId, term, academicYear]
                );

                const averageScore = results[0].average_score;
                const overallGrade = calculateGrade(averageScore);

                // Update student's overall performance
                await pool.query(
                    'INSERT INTO StudentPerformance (user_id, term, academic_year, average_score, overall_grade) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE average_score = ?, overall_grade = ?',
                    [studentInfo[0].user_id, term, academicYear, averageScore, overallGrade, averageScore, overallGrade]
                );

                // Create notification for student and parent
                const message = `Results for ${studentInfo[0].full_name} for ${term} ${academicYear} are now available.`;
                await createNotification(studentInfo[0].user_id, message);

                // Fetch parent's user_id and create notification for parent
                const [parentInfo] = await pool.query(
                    'SELECT user_id FROM Parents WHERE student_id = ?',
                    [studentInfo[0].user_id]
                );
                if (parentInfo.length > 0) {
                    await createNotification(parentInfo[0].user_id, message);
                }
            }

            await pool.query('COMMIT');
            res.status(201).json({ message: 'Result added successfully', resultId: result.insertId });
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
];

  exports.updateResult = [
    validateResult,
    async (req, res) => {
      try {
        const { resultId } = req.params;
        const { score, grade, teacherComment } = req.body;
        const [result] = await pool.query(
          'UPDATE Results SET score = ?, grade = ?, teacher_comment = ? WHERE result_id = ?',
          [score, grade, teacherComment, resultId]
        );
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Result not found' });
        }
        res.json({ message: 'Result updated successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }
    }
  ];

  exports.getStudentResults = async (req, res) => {
    try {
      const { userId } = req.params;
      const { academicYear, term, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
  
      let query = `
        SELECT r.*, s.subject_name, c.class_name, sc.academic_year
        FROM Results r
        JOIN StudentClasses sc ON r.student_class_id = sc.student_class_id
        JOIN Subjects s ON r.subject_id = s.subject_id
        JOIN Classes c ON sc.class_id = c.class_id
        WHERE sc.user_id = ?
      `;
      const queryParams = [userId];
  
      if (academicYear) {
        query += ' AND sc.academic_year = ?';
        queryParams.push(academicYear);
      }
      if (term) {
        query += ' AND r.term = ?';
        queryParams.push(term);
      }
  
      query += ' ORDER BY sc.academic_year DESC, r.term, s.subject_name';
      query += ' LIMIT ? OFFSET ?';
      queryParams.push(parseInt(limit), offset);
  
      const [results] = await pool.query(query, queryParams);
  
      // Get total count for pagination
      const [totalCount] = await pool.query(
        `SELECT COUNT(*) as count FROM Results r
         JOIN StudentClasses sc ON r.student_class_id = sc.student_class_id
         WHERE sc.user_id = ?`,
        [userId]
      );
  
      res.json({
        results,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount[0].count / limit),
          totalResults: totalCount[0].count,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };
  
  exports.generateResultSlip = async (req, res) => {
    const { studentId, term, year } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    const overallGrade = calculateGrade(averageScore);
    const gradePoints = calculateGradePoints(overallGrade);

    try {
        // Fetch student information
        const [studentInfo] = await pool.query(
            'SELECT u.full_name, s.admission_number, c.class_name FROM Users u JOIN Students s ON u.user_id = s.user_id JOIN Classes c ON s.class_id = c.class_id WHERE u.user_id = ?',
            [studentId]
        );

        if (studentInfo.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Fetch results
        const [results] = await pool.query(
            'SELECT s.subject_name, r.score, r.grade FROM Results r JOIN Subjects s ON r.subject_id = s.subject_id WHERE r.student_class_id IN (SELECT student_class_id FROM StudentClasses WHERE user_id = ?) AND r.term = ? AND r.academic_year = ?',
            [studentId, term, year]
        );

        // Calculate total marks and overall grade
        const totalMarks = results.reduce((sum, result) => sum + result.score, 0);
        const averageScore = totalMarks / results.length;
        const overallGrade = calculateGrade(averageScore);

        // Fetch position in class
        const [position] = await pool.query(
            'SELECT COUNT(*) + 1 AS position FROM (SELECT AVG(score) AS avg_score FROM Results WHERE term = ? AND academic_year = ? GROUP BY student_class_id) AS class_scores WHERE avg_score > ?',
            [term, year, averageScore]
        );

        // Generate PDF
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=result_slip_${studentId}_${term}_${year}.pdf`);
        doc.pipe(res);
        doc.text(`Grade Points: ${gradePoints.toFixed(1)}`);

        // Header
        doc.fontSize(18).text('MALINDI HIGH SCHOOL', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Name: ${studentInfo[0].full_name}`);
        doc.text(`Admission No: ${studentInfo[0].admission_number}`);
        doc.text(`Class: ${studentInfo[0].class_name}`);
        doc.text(`Term: ${term} Year: ${year}`);
        doc.moveDown();

        // Main content
        doc.fontSize(14).text('Results', { underline: true });
        doc.moveDown();
        results.forEach(result => {
            doc.text(`${result.subject_name}: ${result.score} (${result.grade})`);
        });
        doc.moveDown();

        // Footer
        doc.fontSize(12).text(`Total Marks: ${totalMarks}`);
        doc.text(`Position in Class: ${position[0].position}`);
        doc.text(`Overall Grade: ${overallGrade}`);
        doc.text(`Grade Points: ${calculateGradePoints(overallGrade)}`);
        doc.moveDown();
        doc.text('Comments: ___________________________________________');

        doc.end();
    } catch (error) {
        console.error('Error generating result slip:', error);
        res.status(500).json({ message: 'Error generating result slip' });
    }
};

// function calculateGrade(score) {
//     if (score > 100) return 'F';
//     if (score >= 80) return 'A';
//     if (score >= 75) return 'A-';
//     if (score >= 70) return 'B+';
//     if (score >= 65) return 'B';
//     if (score >= 60) return 'B-';
//     if (score >= 55) return 'C+';
//     if (score >= 50) return 'C';
//     if (score >= 45) return 'C-';
//     if (score >= 40) return 'D+';
//     if (score >= 35) return 'D';
//     if (score >= 30) return 'D-';
//     if (score > 0) return 'E';
//     return 'F';
// }

// function calculateGradePoints(grade) {
//     switch (grade) {
//         case 'A': return 12.0;
//         case 'A-': return 11.0;
//         case 'B+': return 10.0;
//         case 'B': return 9.0;
//         case 'B-': return 8.0;
//         case 'C+': return 7.0;
//         case 'C': return 6.0;
//         case 'C-': return 5.0;
//         case 'D+': return 4.0;
//         case 'D': return 3.0;
//         case 'D-': return 2.0;
//         case 'E': return 1.0;
//         default: return 0.0;
//     }
// }


  exports.getClassResults = async (req, res) => {
    try {
      const { classId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
  
      const query = `
        SELECT r.*, s.subject_name, u.full_name as student_name, sc.academic_year
        FROM Results r
        JOIN StudentClasses sc ON r.student_class_id = sc.student_class_id
        JOIN Subjects s ON r.subject_id = s.subject_id
        JOIN Users u ON sc.user_id = u.user_id
        WHERE sc.class_id = ?
        ORDER BY u.full_name, s.subject_name, r.term
        LIMIT ? OFFSET ?
      `;
  
      const [results] = await pool.query(query, [classId, parseInt(limit), offset]);
  
      // Get total count for pagination
      const [totalCount] = await pool.query(
        `SELECT COUNT(*) as count FROM Results r
         JOIN StudentClasses sc ON r.student_class_id = sc.student_class_id
         WHERE sc.class_id = ?`,
        [classId]
      );
  
      res.json({
        results,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount[0].count / limit),
          totalResults: totalCount[0].count,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };

exports.getSubjects = async (req, res) => {
  try {
    const [subjects] = await pool.query('SELECT * FROM Subjects ORDER BY subject_name');
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getClasses = async (req, res) => {
  try {
    const [classes] = await pool.query('SELECT * FROM Classes ORDER BY class_name');
    res.json(classes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStudentPerformance = async (req, res) => {
    try {
      const { userId } = req.params;
      const [results] = await pool.query(
        `SELECT sc.academic_year, r.term, AVG(r.score) as average_score
         FROM Results r
         JOIN StudentClasses sc ON r.student_class_id = sc.student_class_id
         WHERE sc.user_id = ?
         GROUP BY sc.academic_year, r.term
         ORDER BY sc.academic_year, r.term`,
        [userId]
      );
      res.json(results);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };