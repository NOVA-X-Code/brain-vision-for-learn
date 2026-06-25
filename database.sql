DROP TABLE IF EXISTS progressions CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS lecons CASCADE;
DROP TABLE IF EXISTS cours CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS utilisateurs CASCADE;

CREATE TABLE utilisateurs (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL, -- Stocké en clair pour le prototype/simplification
    role VARCHAR(20) NOT NULL CHECK (role IN ('promoteur', 'enseignant', 'etudiant')),
    approuve BOOLEAN DEFAULT TRUE -- Sera FALSE par défaut pour les enseignants lors de l'inscription
);

CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(150) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE cours (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    module_id INT REFERENCES modules(id) ON DELETE CASCADE,
    enseignant_id INT REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE lecons (
    id SERIAL PRIMARY KEY,
    cours_id INT REFERENCES cours(id) ON DELETE CASCADE,
    titre VARCHAR(200) NOT NULL,
    type_contenu VARCHAR(10) NOT NULL CHECK (type_contenu IN ('pdf', 'video')),
    fichier_url VARCHAR(255) NOT NULL
);

CREATE TABLE evaluations (
    id SERIAL PRIMARY KEY,
    lecon_id INT REFERENCES lecons(id) ON DELETE CASCADE UNIQUE,
    question TEXT NOT NULL,
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    reponse_correcte CHAR(1) NOT NULL CHECK (reponse_correcte IN ('A', 'B', 'C'))
);

CREATE TABLE progressions (
    id SERIAL PRIMARY KEY,
    etudiant_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
    lecon_id INT REFERENCES lecons(id) ON DELETE CASCADE,
    note INT DEFAULT 0 CHECK (note BETWEEN 0 AND 100),
    complete BOOLEAN DEFAULT FALSE,
    UNIQUE (etudiant_id, lecon_id)
);

-- Insertion du Premier Promoteur Fondateur
INSERT INTO utilisateurs (nom, email, mot_de_passe, role, approuve) VALUES 
('Directeur BrainVision', 'admin@brainvision.com', 'admin123', 'promoteur', TRUE);

-- Insertion d'un Étudiant (Approuvé d'office)
INSERT INTO utilisateurs (nom, email, mot_de_passe, role, approuve) VALUES 
('Jean Apprenant', 'student@brainvision.com', 'student123', 'etudiant', TRUE);
