# Bulk OCR Processing System 🔍

A modern, efficient system for processing large volumes of documents through OCR (Optical Character Recognition), built with Next.js 14.2.16. Configure your preferred OCR provider (Google Cloud Vision or Azure Computer Vision) directly through the user interface.

## ✨ Features

- 📤 Drag-and-drop file uploads with real-time progress tracking
- 🔄 Robust job queue management with IndexedDB storage
- 📊 Interactive dashboard with processing metrics
- 🎯 Support for multiple OCR providers (Google Cloud Vision & Azure)
- ⚙️ In-app OCR configuration with API key validation
- 🖼️ Advanced document viewer with:
  - 🔍 Smooth zoom controls with presets
  - 🖱️ Pan/drag functionality for zoomed images
  - 📐 Fit-to-screen and reset zoom options
  - 🔄 Responsive loading states
  - 📱 Touch-friendly controls
- 🔍 Support for PDF, JPEG, PNG, TIFF, and WebP formats
- ⚡ Optimized batch processing with configurable concurrency
- 🌐 Enhanced multilingual support with RTL text processing
- 🔐 Secure API key management with visibility toggle
- 🎨 Dark mode support with system theme detection
- 💾 Efficient caching for improved performance

## App Demo Video

Below is a demo of the OCR Web App in action:

![OCR Web App Demo](./public/demo_ocr_app.mp4)

![OCR Web App Demo](./public/demo_ocr_app.gif)


## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or later
- NPM or pnpm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/NayerAli/v2-ocr
cd v2-ocr
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Start the development server:
```bash
npm run dev
# or
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 🛠️ Configuration

### OCR Provider Settings

Configure your OCR provider directly in the settings dialog:
- Provider selection (Google Cloud Vision or Azure Computer Vision)
- API key management with validation
- Azure region configuration
- Language preferences with RTL support
- Batch processing options
- Concurrent processing limits

### Document Viewer Settings

Customize the document viewing experience:
- Zoom presets (25% to 200%)
- Pan sensitivity
- Fit-to-screen options
- RTL text display preferences
- Loading state customization

### Processing Options

Customize processing behavior with:
- Batch size (1-50 pages)
- Concurrent processing (1-5 files)
- Language detection
- File format preferences
- Queue management settings

## 📁 Project Structure

```
├── app/
│   ├── components/                             # App-specific components
│   │   ├── analytics-panel.tsx                 # Dashboard analytics component
│   │   ├── document-list.tsx                   # Document grid/list view
│   │   ├── document-details-dialog.tsx         # Document info modal
│   │   ├── file-upload.tsx                     # Drag-n-drop upload component
│   │   ├── header.tsx                          # Main navigation header
│   │   ├── settings-dialog.tsx                 # OCR configuration modal
│   │   └── settings-panel.tsx                  # Settings management panel
│   ├── documents/                              # Document-related pages
│   │   └── [id]/                               # Dynamic document view route
│   ├── fonts/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                                # Homepage
├── components/                                 # Shared components
│   ├── ui/                                     # Shadcn UI components
│   ├── theme-provider.tsx                      # Dark/light theme provider
│   └── toast.tsx                               # Toast notification wrapper
├── config/
│   └── constants.ts                            # Global constants and settings
├── hooks/                                      # Custom React hooks
├── lib/
│   ├── indexed-db.ts                           # IndexedDB storage operations
│   ├── mock-ocr.ts
│   └── processing-service.ts
├── store/
├── types/
│   └── index.ts
├── .env
├── Dockerfile
├── components.json
├── next.config.mjs
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 🔧 Technical Stack

- **Framework**: Next.js 14.2.16
- **UI Components**: Shadcn UI, Radix UI
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB
- **Form Validation**: Zod
- **State Management**: React Server Components + Zustand
- **File Processing**: Built-in MIME type detection
- **Internationalization**: Enhanced RTL support
- **Performance**: Client-side caching, optimized rendering

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📫 Support

For support, please open an issue in the GitHub repository or contact the maintainers.

---

Built with ❤️ using Next.js