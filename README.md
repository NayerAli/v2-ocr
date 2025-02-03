<<<<<<< HEAD
# Bulk OCR Processing System 🔍

A modern, efficient system for processing large volumes of documents through OCR (Optical Character Recognition), built with Next.js 15.1.6. Configure your preferred OCR provider directly through the user interface.

## ✨ Features

- 📤 Drag-and-drop file uploads with real-time progress tracking
- 🔄 Robust job queue management with retry logic
- 📊 Interactive dashboard with processing metrics
- 🎯 Support for multiple OCR providers
- ⚙️ In-app OCR configuration - no environment variables needed
- 🗄️ Built-in SQLite database for reliable job tracking
- 🖼️ Automatic thumbnail generation
- 🔍 Extensive file format support
- ⚡ Optimized chunk processing
- 🌐 Language detection and mapping
- 🔁 Configurable retry options

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or later
- SQLite3

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bulk-ocr-processor.git
cd bulk-ocr-processor
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
- Provider selection
- API credentials
- Region settings
- Language preferences
- Endpoint configuration
- Retry options

### Display Preferences

Customize your experience with:
- Theme selection
- Date/time format preferences
- Dashboard refresh rate
- Recent documents display count
- Processing queue settings

## 📁 Project Structure

```
├── app/
│   ├── api/         # API routes for jobs and settings
│   ├── components/  # React components
│   │   ├── dashboard/     # Main dashboard
│   │   ├── settings/     # Settings dialogs
│   │   └── shared/       # Shared components
│   └── services/    # OCR and file processing
├── public/          # Static assets
└── lib/            # Database and utilities
```

## 🔧 Technical Stack

- **Framework**: Next.js 15.1.6
- **UI Components**: Shadcn UI, Radix
- **Styling**: Tailwind CSS
- **Database**: SQLite
- **Form Validation**: Zod
- **State Management**: React Server Components + nuqs
- **File Processing**: Built-in MIME type detection and thumbnail generation

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
=======
# v2-ocr
>>>>>>> e1f866a38f3951949ce3e25d845b468b3ea13abc
