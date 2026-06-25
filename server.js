const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'brainvision_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Middlewares d'autorisation de rôles
const verifyRole = (role) => (req, res, next) => {
  if (req.session.user && req.session.user.role === role) return next();
  res.redirect('/');
};

// --- PAGES HTML ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views/register.html')));
app.get('/teacher', verifyRole('enseignant'), (req, res) => res.sendFile(path.join(__dirname, 'views/teacher.html')));
app.get('/student', verifyRole('etudiant'), (req, res) => res.sendFile(path.join(__dirname, 'views/student.html')));
app.get('/promoter', verifyRole('promoteur'), (req, res) => res.sendFile(path.join(__dirname, 'views/promoter.html')));

// --- SYSTEME D'AUTHENTIFICATION & INSCRIPTION ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM utilisateurs WHERE email = $1 AND mot_de_passe = $2', [email, password]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Identifiants invalides." });
    
    const user = result.rows[0];
    if (!user.approuve) return res.status(403).json({ error: "Votre compte enseignant est en attente d'approbation par un promoteur." });

    req.session.user = user;
    res.json({ success: true, role: user.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { nom, email, password, role } = req.body;
  if (role === 'promoteur') return res.status(403).json({ error: "Action interdite." });
  
  // Si c'est un enseignant, approuve = false, sinon pour un étudiant approuve = true
  const approuve = (role !== 'enseignant');
  try {
    await db.query('INSERT INTO utilisateurs (nom, email, mot_de_passe, role, approuve) VALUES ($1, $2, $3, $4, $5)', [nom, email, password, role, approuve]);
    res.json({ success: true, message: role === 'enseignant' ? "Inscription réussie ! En attente de validation." : "Inscription réussie !" });
  } catch (err) { res.status(400).json({ error: "Cet email existe déjà." }); }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Non connecté" });
  res.json(req.session.user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// --- ACTIONS DU PROMOTEUR ---
app.get('/api/promoter/teachers/pending', async (req, res) => {
  const result = await db.query("SELECT id, nom, email FROM utilisateurs WHERE role = 'enseignant' AND approuve = false");
  res.json(result.rows);
});

app.post('/api/promoter/teachers/:id/approve', async (req, res) => {
  await db.query("UPDATE utilisateurs SET approuve = true WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

app.post('/api/promoter/create-admin', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'promoteur') return res.status(403).json({ error: "Interdit" });
  const { nom, email, password } = req.body;
  try {
    await db.query("INSERT INTO utilisateurs (nom, email, mot_de_passe, role, approuve) VALUES ($1, $2, $3, 'promoteur', true)", [nom, email, password]);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: "Erreur lors de la création du promoteur." }); }
});

app.get('/api/modules', async (req, res) => {
  const result = await db.query('SELECT * FROM modules');
  res.json(result.rows);
});

app.post('/api/modules', async (req, res) => {
  const { nom, description } = req.body;
  const result = await db.query('INSERT INTO modules (nom, description) VALUES ($1, $2) RETURNING *', [nom, description]);
  res.json(result.rows[0]);
});

// --- ACTIONS DE L'ENSEIGNANT ---
app.get('/api/cours', async (req, res) => {
  const result = await db.query('SELECT c.*, m.nom as module_nom FROM cours c JOIN modules m ON c.module_id = m.id');
  res.json(result.rows);
});

app.post('/api/cours', async (req, res) => {
  const { titre, description, module_id } = req.body;
  const result = await db.query('INSERT INTO cours (titre, description, module_id, enseignant_id) VALUES ($1, $2, $3, $4) RETURNING *', [titre, description, module_id, req.session.user.id]);
  res.json(result.rows[0]);
});

app.post('/api/lecons', upload.single('fichier'), async (req, res) => {
  const { cours_id, titre, type_contenu, question, option_a, option_b, option_c, reponse_correcte } = req.body;
  const fichier_url = req.file ? `/uploads/${req.file.filename}` : '';
  try {
    const leconRes = await db.query('INSERT INTO lecons (cours_id, titre, type_contenu, fichier_url) VALUES ($1, $2, $3, $4) RETURNING *', [cours_id, titre, type_contenu, fichier_url]);
    await db.query('INSERT INTO evaluations (lecon_id, question, option_a, option_b, option_c, reponse_correcte) VALUES ($1, $2, $3, $4, $5, $6)', [leconRes.rows[0].id, question, option_a, option_b, option_c, reponse_correcte]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ACTIONS DE L'ÉTUDIANT ---
app.get('/api/etudiant/cours/:id/lecons', async (req, res) => {
  const result = await db.query(`
    SELECT l.*, e.id as evaluation_id, e.question, e.option_a, e.option_b, e.option_c, p.note, p.complete
    FROM lecons l
    LEFT JOIN evaluations e ON e.lecon_id = l.id
    LEFT JOIN progressions p ON p.lecon_id = l.id AND p.etudiant_id = $1
    WHERE l.cours_id = $2 ORDER BY l.id ASC`, [req.session.user.id, req.params.id]);
  res.json(result.rows);
});

app.post('/api/etudiant/evaluations/:id/soumettre', async (req, res) => {
  const { reponse, lecon_id, cours_id } = req.body;
  const evalQuery = await db.query('SELECT reponse_correcte FROM evaluations WHERE id = $1', [req.params.id]);
  const note = (evalQuery.rows[0].reponse_correcte === reponse) ? 100 : 0;

  await db.query(`
    INSERT INTO progressions (etudiant_id, lecon_id, note, complete) VALUES ($1, $2, $3, true)
    ON CONFLICT (etudiant_id, lecon_id) DO UPDATE SET note = $3, complete = true`, [req.session.user.id, lecon_id, note]);
  res.json({ success: true, note });
});

app.get('/api/etudiant/certificats', async (req, res) => {
  const result = await db.query(`
    SELECT m.nom as module_nom, m.id as module_id FROM modules m
    WHERE NOT EXISTS (
      SELECT l.id FROM lecons l JOIN cours c ON l.cours_id = c.id WHERE c.module_id = m.id
      EXCEPT
      SELECT p.lecon_id FROM progressions p WHERE p.etudiant_id = $1 AND p.note = 100
    )`, [req.session.user.id]);
  res.json(result.rows);
});

app.listen(PORT, () => console.log(`🚀 Brain Vision sur http://localhost:${PORT}`));
