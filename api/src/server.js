const express = require('express');
const { Pool }  = require('pg');
const os        = require('os');
 
const app  = express();
const PORT = process.env.PORT || 3000;
 
app.use(express.json());
 
// ── Database connection pool ──────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'appdb',
  user:     process.env.DB_USER     || 'appuser',
  password: process.env.DB_PASSWORD || 'secret123',
});
 
// ── Bootstrap: create table if it doesn't exist ───────────
async function bootstrap() {
  let retries = 10;
  while (retries > 0) {

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS students (
          id     SERIAL PRIMARY KEY,
          name   TEXT NOT NULL,
          course TEXT NOT NULL DEFAULT 'DevOps 101',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // Seed demo data if table is empty
      const { rows } = await pool.query('SELECT COUNT(*) FROM students');
      if (parseInt(rows[0].count) === 0) {
        await pool.query(
          "INSERT INTO students (name, course) VALUES ($1,$2),($3,$4),($5,$6)",
          ['Alice Johnson','Docker Fundamentals',
           'Bob Smith','CI/CD with GitHub Actions',
           'Carol White','AWS Cloud Practitioner']
        );
      }
      console.log('Database ready');
      return;
    } catch (err) {
      retries--;
      console.log(`DB not ready, retrying (${retries} left)...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('Could not connect to database');
}
 
// ── Routes ────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({
    status:   'healthy',
    version:  process.env.npm_package_version || '1.0.0',
    env:      process.env.NODE_ENV || 'production',
    hostname: os.hostname(),
    uptime:   Math.floor(process.uptime()),
    db:       dbOk,
  });
});
 
app.get('/api/students', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, course FROM students ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/api/students', async (req, res) => {
  const { name, course } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO students (name, course) VALUES ($1,$2) RETURNING *',

      [name, course || 'DevOps 101']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  // Basic validation
  if (!id) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM students WHERE id = $1 RETURNING *',
      [id]
    );

    // If no row was deleted
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Return deleted student (optional but useful)
    res.json({ message: 'Student deleted', student: result.rows[0] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// ── Start ─────────────────────────────────────────────────
bootstrap().then(() =>
  app.listen(PORT, () => console.log(`API running on port ${PORT}`))
);

