# Bulk OCR Processing System

*Ce README est bilingue : la section française est présentée en premier, suivie de la section en anglais. / This README is bilingual: the French section comes first, followed by the English section.*

---

## 🇫🇷 Guide en Français

### Présentation du projet

**Bulk OCR Processing System** est une solution moderne, extensible et performante pour l’OCR (reconnaissance optique de caractères) à grande échelle sur des documents. Cette application web, développée avec **Next.js 14**, **TypeScript** et **Supabase**, permet de traiter de larges volumes de documents (images ou PDF) de manière efficace. Elle prend en charge plusieurs fournisseurs OCR (Google Cloud Vision, Azure Computer Vision, Mistral, etc.) et offre une interface utilisateur intuitive pour téléverser des fichiers, suivre la progression du traitement en temps réel, et visualiser les résultats.

Pensé pour des cas d’usage tels que la numérisation d’archives, le traitement automatisé de lots de documents scannés ou l’extraction de texte de multiples fichiers, ce système facilite le workflow d’OCR en masse. L’utilisateur peut configurer ses paramètres (choix du service OCR, clés API, langue de reconnaissance, etc.) directement depuis l’interface, et bénéficier d’une file d’attente robuste gérant le traitement concurrentiel, la reprise après interruption et la persistance des tâches via une base de données Supabase.

### ✨ Fonctionnalités principales

* **Glisser‑déposer des fichiers** avec suivi de progression en temps réel
* **Gestion robuste de file d’attente** (Supabase) : traitement concurrent, pause/reprise, reprise après coupure
* **Traitement en arrière‑plan** grâce à un **Web Worker** : la file continue même si l’onglet est inactif
* **Support multi‑fournisseurs OCR** : Google, Azure, Mistral – extensible
* **Visionneuse de documents avancée** : zoom, panoramique, ajustement, support RTL, mobile friendly
* **Traitement par lots et en parallèle** configurable
* **Formats pris en charge** : PDF, JPEG, PNG, TIFF, WebP
* **Paramètres configurables in‑app** : fournisseur OCR, clés API, langue, taille de lot, concurrence
* **Gestion sécurisée des clés API** (clés système ou utilisateur)
* **Mode sombre** avec détection automatique
* **Mise en cache efficace** des résultats
* **Internationalisation avancée** (support RTL, chiffres arabo‑persans)
* **Gestion des erreurs conviviale** (messages clairs, logs, validation Zod)
* **Interface responsive et accessible** (Shadcn UI, Radix UI, Tailwind CSS)

### 🚀 Installation et prise en main

#### Prérequis

* **Node.js v20+**
* **npm** ou **pnpm**
* Un compte **Supabase**

#### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/NayerAli/v2-ocr
cd v2-ocr

# 2. Installer les dépendances
npm install   # ou pnpm install

# 3. Variables d’environnement
cp .env.example .env.local
# (éditer .env.local avec vos infos Supabase)

# 4. Préparer la base Supabase
#   – créer un projet Supabase
#   – exécuter le script SQL fourni

# 5. Lancer le serveur de développement
npm run dev   # ou pnpm dev
```

Accédez ensuite à [http://localhost:3000](http://localhost:3000).

> **Note :** Les clés API des services OCR se saisissent depuis le panneau **Settings** de l’application.

### Exemple d’utilisation
![OCR Web App Demo](./public/demo_ocr_v2.gif)

Une fois l’app lancée, glissez‑déposez vos fichiers sur la page d’accueil. Chaque document apparaît dans la file d’attente avec une barre de progression. Pendant le traitement vous pouvez modifier les paramètres (changer de fournisseur, régler la langue, etc.), mettre en pause ou annuler une tâche. Quand un document est terminé, cliquez‑dessus pour l’ouvrir dans la visionneuse intégrée (zoom, pan, fit‑to‑screen, mode sombre, mobile friendly).

### 📁 Architecture du projet

```bash
├── app/
│   ├── components/           # UI spécifique (upload, liste, header…)
│   ├── documents/            # Pages documents, viewer [id]
│   ├── settings/             # Panneau de configuration
│   ├── api/                  # Routes API Next.js
│   └── …
├── components/
│   ├── ui/                   # Primitifs Shadcn UI
│   ├── auth/                 # Auth Supabase
│   └── …
├── lib/
│   ├── ocr/                  # Pipeline OCR (QueueManager, FileProcessor, providers)
│   ├── database/             # Accès Supabase
│   └── …
├── types/                    # Interfaces TypeScript
├── store/                    # Stores Zustand
├── hooks/                    # Hooks React custom
├── config/                   # Config statique
└── public/                   # Assets publics
```

### 🧩 Logique interne (aperçu)

1. **Pipeline OCR** : `QueueManager` → `FileProcessor` → provider (Google/Azure/Mistral), avec batch, retry & rate‑limit.
2. **Supabase** : persistance de la file, résultats OCR, profils utilisateurs.
3. **UI React** : Server Components + Client Components (drag‑drop, progress), Zustand, Shadcn/Radix/Tailwind.
4. **Internationalisation** : UI multilingue, support RTL, formats locaux.

### 🔧 Stack principale

* **Next.js 14**
* **TypeScript**
* **Supabase** (Postgres + Storage + Auth)
* **Shadcn UI / Radix UI / Tailwind CSS**
* **Zustand**, **Zod**
* **OCR APIs** : Google Vision, Azure Vision, Mistral

### 🤝 Contribution

1. Fork → branche (`feature/xyz`) → commit → push → Pull Request.
2. Suivre le style de code existant.
3. Discuter les changements majeurs via *issues*.

### 📝 Licence

MIT

---

## 🇬🇧 English Guide

### Project Overview

**Bulk OCR Processing System** is a modern, extensible web app for large‑scale document OCR. Built with **Next.js 14**, **TypeScript**, and **Supabase**, it processes high volumes of PDFs/images efficiently and supports multiple OCR providers (Google Cloud Vision, Azure Computer Vision, Mistral, etc.). Users can upload files, monitor real‑time progress, and view results in an intuitive interface. Settings (provider, API keys, language, concurrency) are configurable on the fly, and a robust queue backed by Supabase handles concurrency, pause/resume, and persistence.

### ✨ Features

* **Drag‑and‑drop uploads** with live progress
* **Robust queue** (concurrency, pause/resume, persisted via Supabase)
* **Background processing** with a **Web Worker** so jobs continue even when the tab is inactive
* **Multi‑provider OCR**: Google, Azure, Mistral – easily extensible
* **Advanced viewer**: zoom, pan, fit‑to‑screen, RTL support, mobile friendly
* **Batch & parallel processing** configurable
* **Supported formats**: PDF, JPEG, PNG, TIFF, WebP
* **In‑app settings**: provider, API keys, language, batch size, concurrency
* **Secure API key management** (global or per‑user)
* **Dark mode** with auto‑detect
* **Efficient caching** of results
* **Internationalization** (RTL, locale numerals)
* **Friendly error handling** (clear messages, logs, Zod validation)
* **Responsive & accessible UI** (Shadcn UI, Radix UI, Tailwind CSS)

### 🚀 Getting Started

#### Prerequisites

* **Node.js v20+**
* **npm** or **pnpm**
* A **Supabase** account

#### Installation

```bash
# 1. Clone the repo
git clone https://github.com/NayerAli/v2-ocr
cd v2-ocr

# 2. Install dependencies
npm install   # or pnpm install

# 3. Environment vars
cp .env.example .env.local
# (edit .env.local with your Supabase info)

# 4. Supabase setup
#   – create a Supabase project
#   – run provided SQL script

# 5. Start dev server
npm run dev   # or pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000).

> **Note:** Enter OCR provider API keys in the in‑app **Settings** panel – no hard‑coded keys required.

### Example Usage
![OCR Web App Demo](./public/demo_ocr_app.gif)

Drag & drop files onto the home page. Each document enters the queue and shows a progress bar. Modify settings live, pause or cancel jobs as needed. When completed, click a document to open it in the integrated viewer (zoom, pan, fit‑to‑screen, dark mode, mobile ready).

### 📁 Project Structure

```bash
├── app/
│   ├── components/           # App‑specific UI (upload, list, header…)
│   ├── documents/            # Document pages, viewer [id]
│   ├── settings/             # Configuration panel
│   ├── api/                  # Next.js API routes
│   └── …
├── components/
│   ├── ui/                   # Shadcn UI primitives
│   ├── auth/                 # Supabase auth
│   └── …
├── lib/
│   ├── ocr/                  # Pipeline (QueueManager, FileProcessor, providers)
│   ├── database/             # Supabase access
│   └── …
├── types/                    # TypeScript interfaces
├── store/                    # Zustand stores
├── hooks/                    # Custom React hooks
├── config/                   # Static config
└── public/                   # Public assets
```

### 🧩 Core Logic (summary)

1. **OCR Pipeline**: `QueueManager` → `FileProcessor` → provider (Google/Azure/Mistral) with batch, retry & rate‑limit.
2. **Supabase**: queue persistence, OCR results, user profiles.
3. **UI React**: Server Components + Client Components (drag‑drop, progress), Zustand, Shadcn/Radix/Tailwind.
4. **Internationalization**: multi‑language UI, RTL support, locale formats.

### 🔧 Tech Stack

* **Next.js 14**
* **TypeScript**
* **Supabase** (Postgres + Storage + Auth)
* **Shadcn UI / Radix UI / Tailwind CSS**
* **Zustand**, **Zod**
* **OCR APIs**: Google Vision, Azure Vision, Mistral

### 🤝 Contributing

1. Fork → branch (`feature/xyz`) → commit → push → Pull Request.
2. Follow existing code style.
3. Discuss major changes via *issues*.

### 📝 License

MIT

---

Built with ❤️ using Next.js, Supabase, and modern web technologies. Enjoy OCRing at scale!