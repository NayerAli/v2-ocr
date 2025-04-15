# Bulk OCR Processing System

A modern, extensible, and efficient system for large-scale document OCR (Optical Character Recognition), built with Next.js 14, TypeScript, and Supabase. Supports Google Cloud Vision, Azure Computer Vision, and Mistral OCR providers, with a robust queue, real-time progress, and a responsive, accessible UI.

---

## ✨ Features

- **Drag-and-drop uploads** with real-time progress
- **Job queue management** (Supabase-backed, concurrent, resumable)
- **Multi-provider OCR**: Google, Azure, Mistral (easy to extend)
- **Advanced document viewer**: zoom, pan, fit-to-screen, RTL, touch support
- **Batch & concurrent processing**: configurable for performance
- **PDF, JPEG, PNG, TIFF, WebP** support
- **In-app settings**: API keys, concurrency, language, batch size
- **Secure API key management** (system/user keys, validation)
- **Dark mode** (system-aware)
- **Efficient caching** and optimized rendering
- **Internationalization**: RTL, Arabic/Farsi numerals, language-aware UI
- **Error handling**: user-friendly messages, robust logging, Zod validation
- **Responsive, mobile-first UI** (Shadcn UI, Radix, Tailwind)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- NPM or pnpm

### Installation
```bash
git clone https://github.com/NayerAli/v2-ocr
cd v2-ocr
npm install # or pnpm install
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm run dev # or pnpm dev
```
Visit [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Configuration

### Supabase Setup
- Create a project at [supabase.com](https://supabase.com)
- Run `supabase-fix.sql` or `supabase-setup.sql` in the SQL Editor
- Add your Supabase URL and anon key to `.env.local`

### OCR Provider Settings
- Select provider (Google, Azure, Mistral)
- Enter API key (system/user, with validation)
- Configure Azure region, language, batch/concurrency
- All settings are available in-app (Settings panel)

### Document Viewer
- Zoom (25–200%), pan, fit-to-screen, RTL, loading states
- Touch and keyboard accessible

### Processing Options
- Batch size (1–50 pages), concurrency (1–5 files)
- Language detection, file format, queue management

---

## 📁 Project Structure

```
├── app/
│   ├── components/           # App-specific UI (file-upload, document-list, details-dialog, header, supabase-error)
│   ├── documents/            # Document pages, dynamic [id] route for viewer
│   ├── settings/             # In-app settings UI
│   ├── api/                  # API routes (settings, auth, queue)
│   ├── ...                   # Layout, global styles, etc.
├── components/
│   ├── ui/                   # Shadcn UI primitives
│   ├── auth/                 # Auth provider, hooks
│   ├── toast.tsx             # Toast notifications
│   └── theme-provider.tsx    # Theme context
├── lib/
│   ├── ocr/                  # OCR pipeline (queue-manager, file-processor, providers/)
│   ├── database/             # DB services (queue, results, document, stats)
│   ├── ...                   # Supabase, utils, error handling, i18n
├── types/                    # TypeScript interfaces (settings, supabase, OCR)
├── store/                    # Zustand stores (settings, queue)
├── hooks/                    # Custom hooks (settings, language, toast)
├── config/                   # Static config/constants
├── public/                   # Static assets
├── ...                       # Dockerfile, Tailwind, Next config, etc.
```

---

## 🧩 Core Logic & Architecture

### 1. **OCR Pipeline**
- **QueueManager**: Handles job queue, concurrency, pausing, resuming, cancellation, and status updates. Jobs are persisted in Supabase and processed in batches.
- **FileProcessor**: Handles file type detection, PDF chunking, page rendering, and invokes the selected OCR provider. Supports direct PDF OCR (Mistral) or page-by-page fallback.
- **Providers**: Each provider (Google, Azure, Mistral) implements a common interface. Easy to add new providers via `lib/ocr/providers/`.
- **Rate Limiting**: Built-in for Azure/Mistral, with retry logic and UI feedback.

### 2. **Database & State**
- **Supabase**: Used for queue, results, user profiles, and settings. All queue actions are user-scoped.
- **TypeScript interfaces**: All data models are typed (see `types/`).
- **Zustand**: Used for local state (settings, queue) in client components.

### 3. **UI & UX**
- **React Server Components**: Used wherever possible for performance.
- **Client Components**: Only for file uploads, drag-and-drop, and real-time queue updates.
- **Shadcn UI, Radix, Tailwind**: For accessible, responsive, and theme-aware UI.
- **Error Boundaries**: Used for unexpected errors; user-facing messages for expected errors.
- **Internationalization**: RTL, Arabic/Farsi numerals, language-aware formatting.

### 4. **Extensibility**
- **Add new OCR providers**: Implement the `OCRProvider` interface in `lib/ocr/providers/` and register in `index.ts`.
- **Custom settings**: Add to `types/settings.ts` and update the settings panel.
- **API routes**: All server actions are modular and typed.

---

## 🔧 Technical Stack
- **Framework**: Next.js 14 (App Router, RSC)
- **UI**: Shadcn UI, Radix, Tailwind CSS
- **Database**: Supabase (Postgres, Storage)
- **Validation**: Zod
- **State**: React Server Components, Zustand
- **OCR**: Google, Azure, Mistral (extensible)
- **TypeScript**: Strict, interface-first
- **Testing**: (Add your preferred tools)

---

## 📝 License
MIT — see [LICENSE](LICENSE)

## 🤝 Contributing
- Fork, branch, PRs welcome!
- See code style and structure guidelines in this README

## 📫 Support
Open an issue or contact the maintainers.

---

Built with ❤️ using Next.js, TypeScript, and modern web best practices.
