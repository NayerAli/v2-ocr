# Installer l'application OCR sur votre ordinateur

Comptez environ 20 minutes la première fois. Vous n'avez rien à programmer.

## Ce qu'il vous faut

- Le dossier **ocr-client** que votre prestataire vous a envoyé (fichier .zip).
- Une connexion Internet.
- Un ordinateur Windows 10/11 ou Mac récent.

## Étape 1 : installer Docker Desktop (une seule fois)

Docker Desktop est un logiciel gratuit qui fait tourner l'application.

1. Allez sur **https://www.docker.com/products/docker-desktop/**
2. Cliquez sur **Download** pour votre système (Windows, ou Mac « Apple chip » / « Intel chip »).
3. Lancez le fichier téléchargé et acceptez les options proposées.
   - Sur Windows, si on vous propose d'installer « WSL », acceptez.
4. **Redémarrez l'ordinateur** si on vous le demande.
5. Ouvrez Docker Desktop. Vous pouvez passer la création de compte (« Skip »).
6. Dans les paramètres de Docker Desktop (roue dentée), cochez
   **« Start Docker Desktop when you sign in »**. Ainsi l'application OCR
   redémarrera toute seule à chaque allumage de l'ordinateur.

## Étape 2 : préparer le dossier (une seule fois)

1. Faites un clic droit sur le fichier .zip, puis **« Extraire tout »** (Windows) ou double-cliquez dessus (Mac).
2. Placez le dossier obtenu dans **Documents**, par exemple.
3. Ne supprimez et ne modifiez aucun fichier de ce dossier.

## Étape 3 : démarrer l'application

1. Vérifiez que Docker Desktop est ouvert (icône de baleine dans la barre des tâches / en haut de l'écran).
2. Dans le dossier, double-cliquez sur :
   - **Windows** : `Demarrer-OCR.bat`
     (si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires** puis **Exécuter quand même**)
   - **Mac** : `Demarrer-OCR.command`
     (la première fois : **clic droit** sur le fichier, **Ouvrir**, puis **Ouvrir** à nouveau)
3. Une fenêtre noire s'ouvre. **La première fois, cela prend 5 à 10 minutes.** Ne la fermez pas.
4. Quand c'est prêt, votre navigateur s'ouvre tout seul sur l'application.

## Utilisation au quotidien

- Adresse de l'application : **http://localhost:3000** (ajoutez-la à vos favoris).
- Connectez-vous avec **votre e-mail et votre mot de passe habituels**.
- Tant que Docker Desktop est ouvert, l'application fonctionne. Inutile de relancer `Demarrer-OCR` chaque jour.
- Pour arrêter l'application : double-cliquez sur `Arreter-OCR.bat` (Windows) ou `Arreter-OCR.command` (Mac).

Vos documents sont enregistrés en ligne dans votre espace Supabase, pas sur l'ordinateur :
vous ne les perdez pas si l'ordinateur tombe en panne.

## En cas de problème

| Ce que vous voyez | Que faire |
|---|---|
| « Docker Desktop n'est pas lancé » | Ouvrez Docker Desktop, attendez une minute, relancez `Demarrer-OCR`. |
| La page http://localhost:3000 ne s'affiche pas | Attendez 1 minute et rechargez la page. Sinon relancez `Demarrer-OCR`. |
| « .env.local est introuvable » | Le dossier est incomplet : redemandez le .zip à votre prestataire. |
| Sur Mac, le fichier `.command` ne s'ouvre pas | Clic droit, **Ouvrir avec**, **Terminal**. |
| Autre message d'erreur | Faites une capture d'écran de la fenêtre noire et envoyez-la à votre prestataire. |
