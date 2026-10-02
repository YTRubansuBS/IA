# Backrooms — Survival

Un jeu narratif de survie dans les Backrooms.

À chaque tour, le joueur choisit une action. Le moteur Gemini crée une nouvelle scène, de nouvelles conséquences et quatre nouveaux choix. Un petit historique des événements récents est envoyé au moteur pour garder la continuité et varier les situations.

## Gameplay

Le joueur commence au Level 0 avec une petite réserve de ressources.

Statistiques : santé, lucidité, faim, soif, étage et inventaire.

Le jeu est conçu pour continuer pendant énormément de tours : les décors, événements, objets, chemins et choix sont générés dynamiquement.

## Installation

Prérequis : Node.js 20.9 ou plus récent.

Copie `.env.example` vers `.env.local`, puis ajoute ta clé Gemini dans `GEMINI_API_KEY`.

Lance ensuite `npm install`, puis `npm run dev`.

## Vercel

Ajoute `GEMINI_API_KEY` dans les Environment Variables de ton projet Vercel. `GEMINI_MODEL` peut rester à `gemini-3.8-flash`.

La clé API est utilisée uniquement côté serveur.
