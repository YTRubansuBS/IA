# IA Recherche Web

Une application Next.js avec un chat qui effectue une recherche web à chaque message avant de répondre.

## Fonctionnement

Le navigateur envoie l’historique du chat à `/api/chat`. Le serveur appelle l’API Responses d’OpenAI avec l’outil hébergé `web_search`, puis renvoie la réponse et les sources trouvées.

La clé `OPENAI_API_KEY` reste côté serveur et n’est jamais envoyée au navigateur.

## Lancer en local

Prérequis : Node.js 20.9 ou plus récent.

1. Copie `.env.example` vers `.env.local`.
2. Mets ta clé OpenAI dans `OPENAI_API_KEY`.
3. Installe les dépendances :

```bash
npm install
```

4. Lance le projet :

```bash
npm run dev
```

5. Ouvre l’URL affichée par Next.js.

## Déployer

Sur Vercel, ajoute `OPENAI_API_KEY` dans les Environment Variables du projet. Tu peux aussi définir `OPENAI_MODEL` pour utiliser un autre modèle compatible avec la recherche web.

## Notes

La recherche web est volontairement obligatoire dans ce projet : chaque message déclenche une recherche avant la réponse. L’API de recherche web est une fonctionnalité facturée séparément de l’utilisation du modèle selon la tarification OpenAI.
