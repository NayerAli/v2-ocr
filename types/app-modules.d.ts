/*
  Module declarations for app-specific modules that may not have types
  or are missing from the TypeScript compilation.
*/

declare module '@/lib/log' {
  export function debugLog(...args: any[]): void;
  export function debugError(...args: any[]): void;
  export function infoLog(...args: any[]): void;
  export function prodLog(...args: any[]): void;
  export function middlewareLog(...args: any[]): void;
  export function serverError(...args: any[]): void;
}

declare module '@/components/ui/card' {
  import { ReactNode } from 'react';
  
  export interface CardProps {
    className?: string;
    children?: ReactNode;
  }
  
  export function Card(props: CardProps): JSX.Element;
  export function CardContent(props: CardProps): JSX.Element;
  export function CardHeader(props: CardProps): JSX.Element;
  export function CardTitle(props: CardProps): JSX.Element;
  export function CardDescription(props: CardProps): JSX.Element;
}

declare module '@/components/ui/button' {
  import { ReactNode } from 'react';
  
  export interface ButtonProps {
    variant?: string;
    size?: string;
    className?: string;
    onClick?: () => void;
    asChild?: boolean;
    children?: ReactNode;
    type?: string;
    disabled?: boolean;
  }
  
  export function Button(props: ButtonProps): JSX.Element;
}

declare module '@/components/ui/alert' {
  import { ReactNode } from 'react';
  
  export interface AlertProps {
    variant?: string;
    className?: string;
    children?: ReactNode;
  }
  
  export function Alert(props: AlertProps): JSX.Element;
  export function AlertDescription(props: AlertProps): JSX.Element;
  export function AlertTitle(props: AlertProps): JSX.Element;
}

declare module '@/types' {
  export interface ProcessingStatus {
    id: string;
    filename: string;
    originalFilename: string;
    status: 'queued' | 'processing' | 'completed' | 'error' | 'failed' | 'cancelled' | 'pending';
    progress: number;
    currentPage: number;
    totalPages: number;
    fileSize: number;
    fileType: string;
    storagePath?: string;
    file?: File;
    createdAt: Date;
    updatedAt: Date;
    processingStartedAt?: Date;
    processingCompletedAt?: Date;
    error?: string;
    rateLimitInfo?: {
      isRateLimited: boolean;
      retryAfter: number;
      retryAt: string;
    };
    user_id?: string;
    metadata?: {
      type?: string;
      dimensions?: { width: number; height: number };
      [key: string]: any;
    };
  }

  export interface OCRResult {
    id: string;
    documentId: string;
    text: string;
    confidence: number;
    language: string;
    processingTime: number;
    pageNumber: number;
    totalPages: number;
    storagePath?: string;
    imageUrl?: string;
    error?: string;
    rateLimitInfo?: {
      isRateLimited: boolean;
      retryAfter: number;
      retryAt: string;
    };
  }

  export interface OCRSettings {
    provider: string;
    apiKey: string;
    useSystemKey: boolean;
    language: string;
    region?: string;
  }

  export interface DashboardStats {
    totalProcessed: number;
    avgProcessingTime: number;
    successRate: number;
    totalStorage: number;
  }
}

declare module '@/types/settings' {
  export interface OCRSettings {
    provider: string;
    apiKey: string;
    useSystemKey: boolean;
    language: string;
    region?: string;
  }

  export interface ProcessingSettings {
    maxConcurrentJobs: number;
    pagesPerChunk: number;
    concurrentChunks: number;
    pagesPerBatch: number;
    retryAttempts?: number;
    retryDelay?: number;
  }

  export interface UploadSettings {
    maxFileSize: number;
    maxSimultaneousUploads: number;
    allowedFileTypes: string[];
  }

  export interface DisplaySettings {
    theme: string;
    language: string;
  }

  export interface DatabaseSettings {
    maxStorageSize: number;
  }

  export interface DatabaseStats {
    dbSize: number;
    totalDocuments: number;
    totalResults: number;
  }

  export interface SettingsState {
    ocr: OCRSettings;
    processing: ProcessingSettings;
    upload: UploadSettings;
    display: DisplaySettings;
    database: DatabaseSettings;
    export: any;
  }
}

declare module '@/store/settings' {
  import { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings, DatabaseSettings } from '@/types/settings';
  
  export interface Settings {
    ocr: OCRSettings;
    processing: ProcessingSettings;
    upload: UploadSettings;
    display?: DisplaySettings;
    database?: DatabaseSettings;
    updateOCRSettings: (settings: Partial<OCRSettings>) => void;
    updateProcessingSettings: (settings: Partial<ProcessingSettings>) => void;
    updateUploadSettings: (settings: Partial<UploadSettings>) => void;
    updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
    updateDatabaseSettings: (settings: Partial<DatabaseSettings>) => void;
    updateExportSettings: (settings: any) => void;
  }
  
  export function useSettings(): Settings;
}

declare module '@/hooks/use-settings-init' {
  export function useSettingsInit(): {
    isInitialized: boolean;
    isConfigured: boolean;
  };
}

declare module '@/hooks/use-toast' {
  export interface ToastProps {
    title?: string;
    description?: string;
    variant?: 'default' | 'destructive';
  }
  
  export interface Toast extends ToastProps {
    id: string;
    action?: any;
  }
  
  export function useToast(): {
    toast: (props: ToastProps) => void;
    toasts: Toast[];
  };
}

declare module '@/lib/utils' {
  export function cn(...classes: (string | undefined | boolean)[]): string;
  export function isImageFile(fileType: string, filename?: string): boolean;
}

declare module '@/lib/database' {
  export const db: {
    getQueue(): Promise<any[]>;
    saveToQueue(item: any): Promise<void>;
    getDatabaseStats(): Promise<{ dbSize: number }>;
    saveResults(id: string, results: any[]): Promise<void>;
    removeFromQueue(id: string): Promise<void>;
  };
}

declare module '@/lib/processing-service' {
  import { OCRSettings, ProcessingSettings, UploadSettings } from '@/types/settings';
  import { ProcessingStatus } from '@/types';
  
  export function getProcessingService(settings: {
    ocr: OCRSettings;
    processing: ProcessingSettings;
    upload: UploadSettings;
  }): Promise<{
    addToQueue: (files: File[]) => Promise<string[]>;
    getStatus: (id: string) => Promise<ProcessingStatus | undefined>;
    cancelProcessing: (id: string) => Promise<void>;
    pauseQueue: () => Promise<void>;
    resumeQueue: () => Promise<void>;
    updateSettings: (settings: any) => Promise<void>;
    retryDocument: (id: string) => Promise<ProcessingStatus | null>;
  }>;
}

declare module '@/lib/file-utils' {
  export function formatFileSize(bytes: number, language?: string): string;
  export function formatTimestamp(timestamp: Date | string, language?: string): string;
  export function formatDuration(ms: number, language?: string): string;
}

declare module '@/lib/pdf-init' {
  export function initializePDFJS(): Promise<void>;
}

declare module '@/hooks/use-language' {
  export type Language = 'en' | 'fr' | 'ar';
  export function useLanguage(): { language: Language };
}

declare module '@/lib/i18n/translations' {
  export type Language = 'en' | 'fr' | 'ar';
  
  export function t(key: string, language: Language): string;
  export function tCount(key: string, count: number, language: Language): string;
  export const translationKeys: Record<string, string>;
}

declare module '@/components/auth/auth-provider' {
  export function useAuth(): {
    user: any;
    isLoading: boolean;
  };
}

declare module '@/lib/tests/document-status-validation' {
  import { ProcessingStatus } from '@/types';
  export function retryDocument(id: string): Promise<ProcessingStatus | null>;
}

declare module '@/lib/workers/pdf-renderer-test' {
  export function testPdfWorkerInBackground(): Promise<any>;
  export function startContinuousBackgroundTest(): () => void;
}

// Component modules
declare module './components/file-upload' {
  import { ReactNode } from 'react';
  import { ProcessingStatus } from '@/types';
  
  export interface FileUploadProps {
    onFilesAccepted: (files: File[]) => void;
    processingQueue: ProcessingStatus[];
    onPause: () => void;
    onResume: () => void;
    onRemove: (id: string) => void;
    onCancel: (id: string) => void;
    disabled: boolean;
    maxFileSize: number;
    maxSimultaneousUploads: number;
    allowedFileTypes: string[];
    isPageDragging: boolean;
    onDragStateChange: (dragging: boolean) => void;
    language: string;
  }
  
  export function FileUpload(props: FileUploadProps): JSX.Element;
}

declare module './components/document-details-dialog' {
  import { ProcessingStatus } from '@/types';
  
  export interface DocumentDetailsDialogProps {
    document: ProcessingStatus | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRetry: (id: string) => void;
  }
  
  export function DocumentDetailsDialog(props: DocumentDetailsDialogProps): JSX.Element;
}

declare module './components/document-list' {
  import { ProcessingStatus } from '@/types';
  
  export interface DocumentListProps {
    documents: ProcessingStatus[];
    onShowDetails: (doc: ProcessingStatus) => void;
    onDownload: (id: string) => void;
    onDelete: (id: string) => void;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    variant: string;
    showHeader: boolean;
  }
  
  export function DocumentList(props: DocumentListProps): JSX.Element;
}

declare module './components/supabase-error' {
  export function SupabaseError(): JSX.Element;
}

// Icon modules (Lucide React)
declare module 'lucide-react' {
  import { ComponentType, SVGProps } from 'react';
  
  export const Upload: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const FileText: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const CheckCircle: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const CheckCircle2: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const AlertCircle: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Clock: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const LogIn: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const LogOut: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ArrowRight: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Loader2: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Settings: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const User: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Eye: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const EyeOff: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Lock: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Server: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const X: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const XCircle: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Check: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ChevronRight: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ChevronDown: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ChevronUp: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Circle: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ImageIcon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Download: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Trash2: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const RefreshCw: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const MoreHorizontal: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ExternalLink: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Copy: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Search: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Filter: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const SortAsc: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const SortDesc: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const Calendar: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  export const ChevronLeft: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
}

// Next.js modules
declare module 'next/navigation' {
  export function useRouter(): {
    push: (path: string) => void;
    back: () => void;
    forward: () => void;
    refresh: () => void;
  };
  
  export function useSearchParams(): URLSearchParams;
}

declare module 'next/link' {
  import { ReactNode } from 'react';
  
  export interface LinkProps {
    href: string;
    children: ReactNode;
    className?: string;
  }
  
  export default function Link(props: LinkProps): JSX.Element;
}