# Project Desk

Un espace de travail collaboratif minimaliste, inspiré de Word/Notion, pour centraliser les pages, les tâches et les idées d’une équipe.

## Fonctionnalités

- Accès par mot de passe : `Weapons RNG`
- Pseudo membre à l’entrée
- Pages partagées entre les utilisateurs du déploiement
- Éditeur de document simple
- Création de pages
- Création de pages avec l’aide de l’IA
- Tâches partagées avec état terminé / à faire
- Synchronisation automatique toutes les quelques secondes
- Assistant IA pour structurer une page, proposer des idées et préparer des tâches
- L’assistant fonctionne sans clé grâce à un mode local ; ajoutez `GEMINI_API_KEY` pour activer Gemini côté serveur.

## Développement

Node.js 20.9+.

`npm install`
`npm run dev`

## Production

`npm run build`
`npm start`

## IA

Le SDK officiel `@google/genai` est utilisé côté serveur quand `GEMINI_API_KEY` est disponible. Sans clé, un assistant local prend le relais.

## Partage

Le serveur garde un état partagé en mémoire entre les requêtes d’une même instance. Sur un environnement serverless, cet état peut être réinitialisé quand une nouvelle instance démarre ; une base de données est nécessaire pour une persistance multi-instance durable.
