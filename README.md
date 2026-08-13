# Ecran de Suivi Production

App de monitoring temps réel des OF (produits finis + semi-finis) sur les lignes de production.

**Tout-en-un** : frontend Next.js + API + accès DB Prisma dans un seul projet, lancé avec une seule commande.

## Stack

- **Next.js 14** (App Router) — frontend + API Route Handlers
- **TypeScript**
- **TailwindCSS** pour le style
- **TanStack Query** pour le data fetching (cache, polling, retries auto)
- **Prisma** pour l'accès SQL Server (WMS_MP)
- **Lucide** pour les icônes

## Démarrer

```bash
npm install        # installe + génère le client Prisma automatiquement
npm run dev        # lance Next.js sur http://0.0.0.0:8082
```

C'est tout. Pas de second process à lancer.

## Configuration

`.env` à la racine :

```
DATABASE_URL="sqlserver://10.10.2.55:1433;database=WMS_MP;user=...;password=...;encrypt=true;trustServerCertificate=true"
```

## Architecture

```
PAGE_TEST/
├── app/
│   ├── page.tsx                              ← sélection ligne (/)
│   ├── lignes/[code]/page.tsx                ← dashboard d'une ligne (/lignes/L019SHP)
│   └── api/v2/
│       ├── lignes/route.ts                   ← GET /api/v2/lignes
│       └── lignes/[code]/dashboard/route.ts  ← GET /api/v2/lignes/:code/dashboard
├── components/
│   ├── header.tsx
│   ├── kpi-bar.tsx
│   ├── of-card.tsx
│   └── status-pill.tsx
├── lib/
│   ├── prisma.ts                             ← singleton Prisma
│   ├── dashboard-service.ts                  ← logique métier (mappings + queries)
│   ├── api.ts                                ← client API typé (côté frontend)
│   ├── types.ts                              ← types partagés API ↔ front
│   └── utils.ts                              ← helpers de formatage
├── prisma/
│   └── schema.prisma                         ← schéma de la base WMS_MP
├── scripts/
│   └── inspect-db.ts                         ← script d'inspection DB en lecture seule
└── .env                                       ← DATABASE_URL (gitignored)
```

## Endpoints

- `GET /api/v2/lignes` — liste des lignes PF avec compteurs OF
- `GET /api/v2/lignes/:code/dashboard` — dashboard complet d'une ligne (1 seul appel = tout l'écran)

Les réponses sont **prêtes à afficher** : pas de calcul côté frontend, pas de mapping de statut, pas de résolution de SF. Le frontend est un simple afficheur.

## Comportement temps réel

- **Liste lignes** : refresh auto toutes les **30 s**
- **Dashboard ligne** : refresh auto toutes les **10 s**, sans flash (stale-while-revalidate)
- Pause auto quand l'onglet est en arrière-plan
- Backoff exponentiel sur erreur (1s → 2s → 4s, max 30s)
- Annulation auto des requêtes en cours quand la page change

## Inspection DB

Script de lecture seule pour vérifier la structure / valider des hypothèses :

```bash
npm run db:inspect ping        # test de connectivité
npm run db:inspect status      # mapping id_status → designation
npm run db:inspect statusUtil  # mapping id_statusUtilisateur → designation + couleur
npm run db:inspect processes   # liste des lignes PF
npm run db:inspect sample-of   # 1 OF complet avec toutes les jointures
npm run db:inspect validate    # validations clés (SF link, status_production)
```

Pour ajouter une requête, édite `scripts/inspect-db.ts`.

## Mappings DB principaux

Définis dans [lib/dashboard-service.ts](lib/dashboard-service.ts) :

| Champ DB | Mapping |
|---|---|
| `of.type_article = 'ZFER'` | Produit fini (PF) |
| `of.type_article = 'ZHAL'` | Semi-fini (SF) |
| `of.of_secondary` | Lien direct vers le SF associé |
| `of.id_status_FK` | Statut logistique (cf. table `status`) |
| `of.id_statusUtilisateur_FK` | Statut utilisateur (Validé, Débuté, Pause, Panne…) |
| `of.id_status_production` | Statut production (En cours, Cloturé, etc.) |

**Filtre OF actifs sur la ligne** : `id_statusUtilisateur_FK IN (1,2,7,8,9,10,11,13,14,15)`
(exclut Interrompu/Cloture, inclut Validé, Débuté, Pause, Panne, Changement, Manque composant, Pb qualité…)

## Différences avec l'ancienne app (`production-monitoringV3_v080426`)

| | Ancienne | Nouvelle |
|---|---|---|
| Process | 2 (front + API séparés) | 1 (Next.js unifié) |
| Filtre OF | Limite hardcodée à 1 OF (`slice(0,1)`) | Tous les OF actifs |
| Statuts utilisateur considérés | Uniquement "OF Débuté" | 10 statuts (Validé, Débuté, Pause, Panne, Changement, Manque, Pb qualité…) |
| Lien SF | Match fragile par `code_article + numero_lo` | Direct via `of.of_secondary` |
| Requêtes par dashboard | ~7 × N (N+1) | 5 requêtes parallèles total |
| Calculs côté | Frontend | Backend (réponse prête à afficher) |
| Refresh | Spinner sur chaque rafraîchissement | Stale-while-revalidate, 0 flash |

## Production

L'app écoute sur `0.0.0.0:8082` : elle est donc joignable via **l'IP de la
machine où elle est déployée** (ex. http://10.10.32.2:8082) et pas seulement
via `localhost`.

```bash
npm run build
npm start          # http://<ip-du-serveur>:8082
```

### Avec PM2 (recommandé en prod)

```bash
npm install -g pm2
npm run build
pm2 start ecosystem.config.js
pm2 save                       # relance auto après reboot (+ pm2-startup sous Windows)
pm2 logs ecran-moniteur
```

Le host et le port sont surchargeables sans toucher au fichier :
`HOST=10.10.32.2 PORT=9000 pm2 start ecosystem.config.js`.

⚠️ `exec_mode: fork` (1 instance) est volontaire : le cache in-memory de
`lib/dashboard-service.ts` est par process, un mode cluster multiplierait les
requêtes SQL par le nombre de workers.

Pensez à ouvrir le port 8082 dans le pare-feu Windows :

```powershell
New-NetFirewallRule -DisplayName "Ecran Moniteur 8082" -Direction Inbound -LocalPort 8082 -Protocol TCP -Action Allow
```
# Ecran_moniteur
