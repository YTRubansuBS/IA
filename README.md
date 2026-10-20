# Roblox Analytics

Tableau de bord Next.js pour suivre les expériences Roblox de deux comptes fixes :

- 3671739729
- 4963417975

## Ce que le tableau de bord affiche

- Toutes les expériences publiques trouvées pour chaque compte
- Joueurs actuellement en jeu, visites, favoris, likes/dislikes, dates et IDs
- DAU, MAU, sessions et temps de jeu
- Temps de session et temps de jeu moyen
- Rétention D1 / D7
- Revenus, utilisateurs payants et conversion payeur
- Acquisition : impressions, clics, jeux, CTR et play rate par source
- Sources comme Home, Recherche, Amis, Charts, publicités, téléportation, etc.
- Répartition par plateforme, pays, groupe d'âge et nouveaux/anciens utilisateurs
- Signaux Recommended For You : play-through, bounce, play days, playtime, co-play, qualified sessions et Robux spend
- Périodes de 7, 30, 90 et 365 jours

## Configuration Roblox

Les informations publiques des jeux fonctionnent sans clé.

Pour les Creator Analytics, ajoute une clé Roblox Open Cloud côté serveur dans Vercel :

```text
ROBLOX_API_KEY
```

ou, pour séparer les deux comptes :

```text
ROBLOX_API_KEY_3671739729
ROBLOX_API_KEY_4963417975
```

La clé doit avoir l'autorisation `universe.analytics:read` pour les expériences concernées. Ne mets jamais la clé dans `NEXT_PUBLIC_*` ni dans le navigateur.

## Limite importante

Creator Analytics fournit principalement des données agrégées. Le tableau de bord n'affiche donc pas la liste nominative de chaque joueur avec son temps individuel : Roblox ne fournit pas cette donnée individuelle via l'Analytics Query API standard.

## Développement

Node.js 22+.

```
npm install
npm run dev
```
