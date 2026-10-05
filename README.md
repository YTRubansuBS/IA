# Project Desk

Espace de travail collaboratif façon Word/Notion avec pages, tâches partagées et assistant Gemini.

## Fonctionnalités

- Accès protégé à l’espace
- Pseudo membre
- Pages partagées
- Éditeur de pages
- Tâches partagées
- Synchronisation automatique
- Persistance Supabase
- Assistant Gemini via la variable `IA`

## Variables Vercel

Dans **Project Settings → Environment Variables**, ajoute :

```text
IA=ta_cle_api_gemini
URL=https://ton-projet.supabase.co
KEY=ta_cle_secrete_supabase
```

Les variables sont lues uniquement côté serveur. La clé Supabase `KEY` doit être une clé serveur secrète et ne doit jamais être envoyée au navigateur.

## Base Supabase

Ouvre le **SQL Editor** de ton projet Supabase et exécute :

`supabase/schema.sql`

Il crée les tables `workspace_pages` et `workspace_tasks`, avec Row Level Security activé.

## Gemini

Le projet utilise le SDK officiel `@google/genai` côté serveur et la variable `IA` pour appeler Gemini.

## Développement

Node.js 22+.

`npm install`
`npm run dev`

## Production

`npm run build`
`npm start`
