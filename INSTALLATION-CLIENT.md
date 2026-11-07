# Installer l'application OCR sur votre ordinateur (Windows)

Tout s'installe sur votre ordinateur : l'application **et** la base de données
(vos comptes, vos documents, vos fichiers). Vous n'avez rien à programmer.

Comptez environ **45 minutes** la première fois, surtout du téléchargement.

## Ce qu'il vous faut

- Windows 10 ou 11, avec au moins **8 Go de mémoire** et **15 Go d'espace libre**.
- Le fichier **ocr-client.zip** envoyé par votre prestataire.
- L'accès au tableau de bord Supabase actuel (celui que vous utilisez déjà).

## Étape 1 : installer Docker Desktop (une seule fois)

Docker Desktop est un logiciel gratuit qui fait tourner l'application.

1. Allez sur **https://www.docker.com/products/docker-desktop/** et cliquez sur
   **Download for Windows**.
2. Lancez le fichier téléchargé et acceptez les options proposées
   (si on vous propose « WSL », acceptez).
3. **Redémarrez l'ordinateur** si on vous le demande.
4. Ouvrez Docker Desktop. Vous pouvez passer la création de compte (« Skip »).
5. Dans Docker Desktop, cliquez sur la roue dentée (Settings) et cochez
   **« Start Docker Desktop when you sign in to your computer »**,
   puis **Apply**. Ainsi l'application redémarrera toute seule chaque jour.

## Étape 2 : préparer le dossier (une seule fois)

1. Faites un clic droit sur **ocr-client.zip**, puis **« Extraire tout… »**.
2. Choisissez le dossier **Documents**, puis **Extraire**.

## Étape 3 : lancer l'installation (une seule fois)

1. Vérifiez que Docker Desktop est ouvert (icône de baleine en bas à droite de l'écran).
2. Dans le dossier, double-cliquez sur **`Installer-OCR.bat`**.
   Si Windows affiche « Windows a protégé votre ordinateur » :
   cliquez sur **Informations complémentaires**, puis **Exécuter quand même**.
3. Une fenêtre noire s'ouvre. Laissez-la travailler (10 à 20 minutes).
4. Elle vous posera **2 questions**, avec les explications à l'écran :
   - **L'adresse de votre Supabase actuel** : celle que vous tapez dans le navigateur
     pour ouvrir le tableau de bord Supabase. Copiez-la depuis la barre d'adresse.
   - **La clé « service_role »** : dans le tableau de bord Supabase, roue dentée
     en bas à gauche, **API Keys**, onglet **Legacy anon, service_role API keys**,
     ligne **service_role**, boutons **Reveal** puis **Copy**.
     Revenez dans la fenêtre noire, clic droit pour coller, Entrée.

     ![Où trouver la clé service_role](docs/cle-service-role.png)

5. La fenêtre affiche ce qu'elle va copier. Tapez **OUI** puis Entrée.
6. À la fin, votre navigateur s'ouvre sur l'application, ainsi qu'un fichier
   **MES-ACCES.txt** : gardez-le précieusement.

Le serveur actuel est seulement **lu** : rien n'y est modifié ni supprimé.

## Utilisation au quotidien

- Application : **http://localhost:3000** (ajoutez-la à vos favoris).
- Connectez-vous avec **votre e-mail et votre mot de passe habituels**.
- Tant que Docker Desktop est ouvert, l'application fonctionne.
- Pour la relancer si besoin : double-cliquez sur **`Demarrer-OCR.bat`**.
- Pour l'arrêter : double-cliquez sur **`Arreter-OCR.bat`** (vos données restent).
- Tableau de bord Supabase local : **http://localhost:8000**
  (identifiant et mot de passe dans **MES-ACCES.txt**).

## Important

- Vos données sont maintenant **sur cet ordinateur**. Ne désinstallez pas Docker Desktop
  et ne supprimez pas le dossier.
- Ne lancez pas `Installer-OCR.bat` sur un autre ordinateur sans en parler à votre
  prestataire.

## En cas de problème

| Ce que vous voyez | Que faire |
|---|---|
| « Docker Desktop n'est pas lancé » | Ouvrez Docker Desktop, attendez une minute, relancez le fichier. |
| « Impossible de joindre cette adresse » | Recopiez l'adresse depuis la barre d'adresse du navigateur où le tableau de bord Supabase est ouvert. |
| « C'est la clé anon » | Vous avez copié la mauvaise clé : prenez celle de la ligne **service_role**. |
| « L'installation s'est arrêtée » | Relancez `Installer-OCR.bat` : il reprend là où il s'était arrêté. |
| La page http://localhost:3000 ne s'affiche pas | Attendez 1 minute et rechargez. Sinon, lancez `Demarrer-OCR.bat`. |
| Autre message d'erreur | Faites une capture d'écran de la fenêtre noire et envoyez-la à votre prestataire. |
