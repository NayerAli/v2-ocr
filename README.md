# Bulk OCR Processing System 🔍

A modern, efficient system for processing large volumes of documents through OCR (Optical Character Recognition), built with Next.js 14.2.16. Configure your preferred OCR provider (Google Cloud Vision or Azure Computer Vision) directly through the user interface.

## ✨ Features

- 📤 Drag-and-drop file uploads with real-time progress tracking
- 🔄 Robust job queue management with IndexedDB storage
- 📊 Interactive dashboard with processing metrics
- 🎯 Support for multiple OCR providers (Google Cloud Vision & Azure)
- ⚙️ In-app OCR configuration with API key validation
- 🖼️ Built-in file preview and thumbnail generation
- 🔍 Support for PDF, JPEG, PNG, TIFF, and WebP formats
- ⚡ Optimized batch processing with configurable concurrency
- 🌐 Multilingual support with RTL languages (Arabic, Persian)
- 🔐 Secure API key management with visibility toggle
- 🎨 Dark mode support with system theme detection

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or later
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
│   ├── api/         # API routes
│   ├── components/  # React components
│   │   ├── ui/           # Shadcn UI components
│   │   └── settings/     # Settings components
│   └── lib/        # Utilities and services
├── config/         # Configuration constants
└── public/         # Static assets
```

## 🔧 Technical Stack

- **Framework**: Next.js 14.2.16
- **UI Components**: Shadcn UI, Radix UI
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB
- **Form Validation**: Zod
- **State Management**: React Server Components + Zustand
- **File Processing**: Built-in MIME type detection
- **Internationalization**: Built-in RTL support

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