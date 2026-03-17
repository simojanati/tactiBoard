# Playbook Manager Starter

Structure du projet:
- `index.html`: redirection vers `pages/login.html`
- `pages/`: pages principales de l'application
- `assets/js/app/`: logique métier liée à Supabase
- `assets/css/app.css`: styles custom du projet
- `assets/js/app/config.local.js`: configuration Supabase locale
- `sql/phaseC_auth_profiles.sql`: SQL à exécuter pour activer les profils et rôles

## Ce qui est inclus
- Dashboard
- Équipes
- Joueuses
- Coachs
- Tactiques
- Détail tactique
- Séances liées aux tactiques
- Matchs + game plan
- Login / création de compte Supabase
- Rôles de base: `admin`, `coach`, `player`

## Important avant test Phase C
Exécute d'abord le fichier SQL suivant dans **Supabase > SQL Editor**:
- `sql/phaseC_auth_profiles.sql`

Sans ça, le login peut marcher mais les rôles/profils ne seront pas gérés correctement.

## Test en local avec XAMPP
1. Copier le dossier dans `htdocs`
2. Lancer Apache
3. Ouvrir `http://localhost/NOM_DU_DOSSIER/`
4. Créer un compte depuis `pages/login.html`
5. Se connecter

## Règles actuelles par rôle
- `admin`: accès complet
- `coach`: joueuses, tactiques, séances, matchs
- `player`: consultation du dashboard, tactiques, séances, matchs

## Remarque
La sécurité métier complète (RLS avancé par rôle sur toutes les tables) n'est pas encore activée.
Cette phase ajoute surtout:
- l'authentification
- les profils
- l'adaptation de la navigation et des actions selon le rôle


## Liaison coachs
Avant d'utiliser la liaison coachs, exécute aussi:
- `sql/phaseC_coaches_profile_link.sql`
