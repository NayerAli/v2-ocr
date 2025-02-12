// Define supported languages
export type Language = 'en' | 'fr' | 'ar' | 'fa'

// Define translation keys interface
interface TranslationKeys {
  // Navigation
  dashboard: string
  documents: string
  settings: string
  changeLanguage: string
  toggleTheme: string
  
  // Dashboard
  welcome: string
  dashboardTitle: string
  dashboardDescription: string
  
  // Upload Section
  uploadDocuments: string
  uploadDescription: string
  
  // Stats
  totalDocuments: string
  processingStatus: string
  successRate: string
  processingSpeed: string
  processed: string
  used: string
  queued: string
  rateLimited: string
  autoResuming: string
  pagesPerBatch: string
  chunks: string
  
  // Recent Documents
  recentDocuments: string
  recentDescription: string
  viewAll: string
  
  // Alerts
  configureRequired: string
  configureMessage: string
  configureSettings: string
  
  // Notifications
  filesAdded: string
  filesAddedDesc: (count: number) => string
  uploadError: string
  processingCancelled: string
  processingCancelledDesc: string
  error: string
  failedToCancel: string
  failedProcess: string

  // Document Library
  documentsLibrary: string
  processedDocuments: string
  documentsDescription: string
  uploadNew: string
  searchDocuments: string
  filterByStatus: string
  allStatus: string
  sortBy: string
  sortByDate: string
  sortByName: string
  sortBySize: string

  // Document Status
  completed: string
  processing: string
  cancelled: string
  processingPage: (current: number, total: number) => string
  status: string
  pending: string
  failed: string
  
  // Document Actions
  copyText: string
  copied: string
  download: string
  downloaded: string
  tryAgain: string
  maxRetriesReached: string
  
  // Document Preview
  sourceDocument: string
  extractedText: string
  loadingPreview: string
  retrying: string
  previewNotAvailable: string
  loadingDocument: string
  noTextExtracted: string
  page: string
  of: string
  goToPage: string

  // Zoom Controls
  zoomIn: string
  zoomOut: string
  resetZoom: string
  original: string

  // Search
  searchInDocument: string
  shortcuts: string
  navigation: string
  zoom: string
  document: string
  nextPage: string
  previousPage: string
  focusSearch: string

  // Document Management
  documentDetails: string
  basicInfo: string
  processingInfo: string
  fileName: string
  fileType: string
  fileSize: string
  totalPages: string
  processedPages: string
  startTime: string
  endTime: string
  totalDuration: string
  errorDetails: string
  processingConfiguration: string
  concurrentJobs: string
  pagesPerChunk: string
  concurrentChunks: string
  close: string
  openMenu: string
  viewDetails: string
  delete: string
  progress: string
  date: string
  pages: string
  size: string
  actions: string
  calculating: string
  unknown: string
  loadingDocuments: string
  noDocuments: string
  downloadNotAvailableForCancelledFiles: string
  notStarted: string
  notCompleted: string
  provider: string
  language: string

  // Document Viewer
  reset: string
  resetTo100: string
  textSize: string

  // Technical details
  technicalDetails: string
  fileInformation: string
  processingDetails: string

  // Upload UI
  dropFiles: string
  browseFiles: string
  configureToUpload: string
  dragAndDrop: string
  orBrowse: string
  supports: string
  upTo: string
  filesEach: string
  mbEach: string
  noActiveUploads: string
  dropFilesAbove: string
  resumingIn: string

  // Processing Queue
  processingQueue: string
  pause: string
  resume: string
  rateLimitMessage: string
  cancel: string
  remove: string
  uploadingFiles: string

  // Document Viewer Controls
  fitToWidth: string
  fitToHeight: string
  fitToPage: string
  copyToClipboard: string
  downloadText: string
  showShortcuts: string
  textSizeSmall: string
  textSizeMedium: string
  textSizeLarge: string
  textSizeExtraLarge: string
  showTextSizeMenu: string
  showZoomMenu: string
  zoomLevel: string
  zoomInShortcut: string
  zoomOutShortcut: string
  nextPageShortcut: string
  previousPageShortcut: string
  searchShortcut: string
  copyShortcut: string
  downloadShortcut: string
  resetZoomShortcut: string
  toggleTextSizeShortcut: string
  toggleZoomShortcut: string

  // Settings Dialog
  settingsTitle: string
  settingsDescription: string
  ocrTab: string
  processingTab: string
  uploadTab: string
  statsTab: string
  
  // OCR Settings
  textRecognitionService: string
  textRecognitionDescription: string
  accessKey: string
  accessKeyDescription: string
  serviceLocation: string
  serviceLocationDescription: string
  documentLanguage: string
  documentLanguageDescription: string
  
  // Processing Settings
  parallelProcessing: string
  parallelProcessingDescription: string
  pagesPerBatchDescription: string
  processingSpeedDescription: string
  autoRetry: string
  autoRetryDescription: string
  retryTiming: string
  retryTimingDescription: string
  
  // Upload Settings
  maxFileSize: string
  maxFileSizeDescription: string
  acceptedFiles: string
  acceptedFilesDescription: string
  uploadSpeed: string
  uploadSpeedDescription: string
  
  // Stats Overview
  storageOverview: string
  ocrSettings: string
  uploadSettings: string
  totalResults: string
  storageUsed: string
  averageSizePerDoc: string
  maxJobs: string
  retryAttempts: string
  retryDelay: string
  maxParallel: string
  fileTypes: string
  storageLimit: string
  loadingStatistics: string
  current: string

  // API Validation
  validationError: string
  apiValidationFailed: string
  apiValidationSuccess: string
  apiConfigValid: string
  unexpectedError: string
  testApi: string
  enterApiKey: string
  hideApiKey: string
  showApiKey: string
}

// Create base translations object
export const translations: Record<Language, Partial<TranslationKeys>> = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    documents: 'Documents',
    settings: 'Settings',
    changeLanguage: 'Change language',
    toggleTheme: 'Toggle theme',
    
    // Dashboard
    welcome: 'Welcome back',
    dashboardTitle: 'OCR Processing Dashboard',
    dashboardDescription: 'Process and extract text from your documents. Upload files in PDF, JPG, JPEG, or PNG format.',
    
    // Upload Section
    uploadDocuments: 'Upload Documents',
    uploadDescription: 'Process and extract text from your documents using our advanced OCR technology.',
    
    // Stats
    totalDocuments: 'Total Documents',
    processingStatus: 'Processing Status',
    successRate: 'Success Rate',
    processingSpeed: 'Processing Speed',
    processed: 'processed',
    used: 'used',
    queued: 'queued',
    rateLimited: 'Rate limited',
    autoResuming: 'Auto-resuming',
    pagesPerBatch: 'Pages per batch',
    chunks: 'chunks',
    
    // Recent Documents
    recentDocuments: 'Recent Documents',
    recentDescription: 'Recently processed documents and their status',
    viewAll: 'View All',
    
    // Alerts
    configureRequired: 'Action Required',
    configureMessage: 'Please configure your OCR API settings before uploading documents.',
    configureSettings: 'Configure Settings',
    
    // Notifications
    filesAdded: 'Files Added',
    filesAddedDesc: (count: number) => `Added ${count} file(s) to processing queue`,
    uploadError: 'Upload Error',
    processingCancelled: 'Processing Cancelled',
    processingCancelledDesc: 'Document processing has been cancelled',
    error: 'Error',
    failedToCancel: 'Failed to cancel processing',
    failedProcess: 'Failed to process files',

    // Document Library
    documentsLibrary: 'Documents Library',
    processedDocuments: 'Processed Documents',
    documentsDescription: 'View and manage your processed documents. Filter, sort, and download extracted text.',
    uploadNew: 'Upload New',
    searchDocuments: 'Search documents by name...',
    filterByStatus: 'Filter by status',
    allStatus: 'All Status',
    sortBy: 'Sort by',
    sortByDate: 'Sort by Date',
    sortByName: 'Sort by Name',
    sortBySize: 'Sort by Size',

    // Document Status
    completed: 'Completed',
    processing: 'Processing',
    cancelled: 'Cancelled',
    processingPage: (current: number, total: number) => `Processing page ${current} of ${total}`,
    status: 'Status',
    pending: 'Pending',
    failed: 'Failed',
    
    // Document Actions
    copyText: 'Copy text',
    copied: 'Copied',
    download: 'Download',
    downloaded: 'Downloaded',
    tryAgain: 'Try Again',
    maxRetriesReached: 'Max Retries Reached',
    
    // Document Preview
    sourceDocument: 'Source Document',
    extractedText: 'Extracted Text',
    loadingPreview: 'Loading preview...',
    retrying: 'Retrying...',
    previewNotAvailable: 'No preview available',
    loadingDocument: 'Loading document...',
    noTextExtracted: 'No text extracted for this page',
    page: 'Page',
    of: 'of',
    goToPage: 'Go to page',

    // Zoom Controls
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    original: 'Original',

    // Search
    searchInDocument: 'Search in document...',
    shortcuts: 'Shortcuts',
    navigation: 'Navigation',
    zoom: 'Zoom',
    document: 'Document',
    nextPage: 'Next page',
    previousPage: 'Previous page',
    focusSearch: 'Focus search',

    // Document Management
    documentDetails: 'Document Details',
    basicInfo: 'Basic Information',
    processingInfo: 'Processing Information',
    fileName: 'File Name',
    fileType: 'File Type',
    fileSize: 'File Size',
    totalPages: 'Total Pages',
    processedPages: 'Processed Pages',
    startTime: 'Start Time',
    endTime: 'End Time',
    totalDuration: 'Total Duration',
    errorDetails: 'Error Details',
    processingConfiguration: 'Processing Configuration',
    concurrentJobs: 'Concurrent Jobs',
    pagesPerChunk: 'Pages per Chunk',
    concurrentChunks: 'Concurrent Chunks',
    close: 'Close',
    openMenu: 'Open menu',
    viewDetails: 'View Details',
    delete: 'Delete',
    progress: 'Progress',
    date: 'Date',
    pages: 'Pages',
    size: 'Size',
    actions: 'Actions',
    calculating: 'Calculating...',
    unknown: 'Unknown',
    loadingDocuments: 'Loading documents...',
    noDocuments: 'No documents found',
    downloadNotAvailableForCancelledFiles: 'Download is not available for cancelled files',
    notStarted: 'Not started',
    notCompleted: 'Not completed',
    provider: 'Provider',
    language: 'Language',

    // Document Viewer
    reset: 'Reset',
    resetTo100: 'Reset to 100%',
    textSize: 'Text size',

    // Technical details
    technicalDetails: 'Technical details and processing information about your document',
    fileInformation: 'File Information',
    processingDetails: 'Processing Details',

    // Upload UI
    dropFiles: 'Drop files here to start processing',
    browseFiles: 'browse',
    configureToUpload: 'Configure API settings to upload files',
    dragAndDrop: 'Drag and drop your files here',
    orBrowse: 'or browse to choose files',
    supports: 'Supports',
    upTo: 'Up to',
    filesEach: 'files',
    mbEach: 'MB each',
    noActiveUploads: 'No Active Uploads',
    dropFilesAbove: 'Drop your files above to start processing. Your queue will appear here.',
    resumingIn: 'Resuming in',

    // Processing Queue
    processingQueue: 'Processing Queue',
    pause: 'Pause',
    resume: 'Resume',
    rateLimitMessage: 'Rate limit reached - Processing will resume automatically',
    cancel: 'Cancel',
    remove: 'Remove',
    uploadingFiles: 'Uploading files...',

    // Document Viewer Controls
    fitToWidth: 'Fit to width',
    fitToHeight: 'Fit to height',
    fitToPage: 'Fit to page',
    copyToClipboard: 'Copy to clipboard',
    downloadText: 'Download text',
    showShortcuts: 'Show shortcuts',
    textSizeSmall: 'Small',
    textSizeMedium: 'Medium',
    textSizeLarge: 'Large',
    textSizeExtraLarge: 'Extra Large',
    showTextSizeMenu: 'Show text size menu',
    showZoomMenu: 'Show zoom menu',
    zoomLevel: 'Zoom level',
    zoomInShortcut: 'Zoom in (Ctrl +)',
    zoomOutShortcut: 'Zoom out (Ctrl -)',
    nextPageShortcut: 'Next page (→)',
    previousPageShortcut: 'Previous page (←)',
    searchShortcut: 'Search (Ctrl F)',
    copyShortcut: 'Copy (Ctrl C)',
    downloadShortcut: 'Download (Ctrl D)',
    resetZoomShortcut: 'Reset zoom (Ctrl 0)',
    toggleTextSizeShortcut: 'Toggle text size (Ctrl T)',
    toggleZoomShortcut: 'Toggle zoom (Ctrl Z)',

    // Settings Dialog
    settingsTitle: 'Settings',
    settingsDescription: 'Customize how your text recognition app works. We\'ll help you understand each option!',
    ocrTab: 'OCR',
    processingTab: 'Processing',
    uploadTab: 'Upload',
    statsTab: 'Overview',
    
    // OCR Settings
    textRecognitionService: 'Text Recognition Service',
    textRecognitionDescription: 'Pick which AI service will read your documents. Both Google and Microsoft are great at this!',
    accessKey: 'Access Key',
    accessKeyDescription: 'Think of this as your VIP pass to use the service. Keep it secret!',
    serviceLocation: 'Service Location',
    serviceLocationDescription: 'Pick the closest region for best speed (e.g., \'westeurope\')',
    documentLanguage: 'Document Language',
    documentLanguageDescription: 'Select your document\'s main language for better accuracy',
    
    // Processing Settings
    parallelProcessing: 'Parallel Processing',
    parallelProcessingDescription: 'Process multiple documents at once',
    pagesPerBatchDescription: 'How many pages to group together',
    processingSpeedDescription: 'How many page groups to process at once',
    autoRetry: 'Auto-Retry',
    autoRetryDescription: 'Number of retry attempts if processing fails',
    retryTiming: 'Retry Timing',
    retryTimingDescription: 'Wait time between retries (in milliseconds)',
    
    // Upload Settings
    maxFileSize: 'Maximum File Size',
    maxFileSizeDescription: 'Largest allowed file size (MB). Typical 20-page PDF: 2-3 MB',
    acceptedFiles: 'Accepted Files',
    acceptedFilesDescription: 'File types allowed (e.g., pdf, png, jpg)',
    uploadSpeed: 'Upload Speed',
    uploadSpeedDescription: 'Number of files to upload at once',
    
    // Stats Overview
    storageOverview: 'Storage Overview',
    ocrSettings: 'OCR Settings',
    uploadSettings: 'Upload Settings',
    totalResults: 'Total Results',
    storageUsed: 'Storage Used',
    averageSizePerDoc: 'Average Size/Doc',
    maxJobs: 'Max Jobs',
    retryAttempts: 'Retry Attempts',
    retryDelay: 'Retry Delay',
    maxParallel: 'Max Parallel',
    fileTypes: 'File Types',
    storageLimit: 'Storage Limit',
    loadingStatistics: 'Loading statistics...',
    
    // API Validation
    validationError: 'Validation Error',
    apiValidationFailed: 'API Validation Failed',
    apiValidationSuccess: 'API Validation Successful',
    apiConfigValid: 'Your API configuration is valid.',
    unexpectedError: 'An unexpected error occurred',
    testApi: 'Test API',
    enterApiKey: 'Enter your API key',
    hideApiKey: 'Hide API key',
    showApiKey: 'Show API key'
  },
  fr: {
    // Navigation
    dashboard: 'Tableau de bord',
    documents: 'Documents',
    settings: 'Paramètres',
    changeLanguage: 'Changer de langue',
    toggleTheme: 'Changer le thème',
    
    // Dashboard
    welcome: 'Bon retour',
    dashboardTitle: 'Tableau de bord OCR',
    dashboardDescription: 'Traitez et extrayez le texte de vos documents. Formats acceptés : PDF, JPG, JPEG ou PNG.',
    
    uploadDocuments: 'Importer des documents',
    uploadDescription: 'Traitez vos documents avec notre technologie OCR avancée.',
    
    // Stats
    totalDocuments: 'Total des documents',
    processingStatus: 'État du traitement',
    successRate: 'Taux de réussite',
    processingSpeed: 'Vitesse de traitement',
    processed: 'traités',
    used: 'utilisé',
    queued: 'en attente',
    rateLimited: 'Limite atteinte',
    autoResuming: 'Reprise automatique',
    pagesPerBatch: 'Pages par lot',
    chunks: 'lots',
    
    // Recent Documents
    recentDocuments: 'Documents récents',
    recentDescription: 'Documents récemment traités et leur état',
    viewAll: 'Voir tout',
    
    // Alerts
    configureRequired: 'Action requise',
    configureMessage: 'Veuillez configurer les paramètres de l\'API OCR avant d\'importer des documents.',
    configureSettings: 'Configurer',
    
    // Notifications
    filesAdded: 'Fichiers ajoutés',
    filesAddedDesc: (count: number) => `${count} fichier(s) ajouté(s) à la file d'attente`,
    uploadError: 'Erreur d\'import',
    processingCancelled: 'Traitement annulé',
    processingCancelledDesc: 'Le traitement du document a été annulé',
    error: 'Erreur',
    failedToCancel: 'Échec de l\'annulation',
    failedProcess: 'Échec du traitement des fichiers',

    // Document Library
    documentsLibrary: 'Bibliothèque de documents',
    processedDocuments: 'Documents traités',
    documentsDescription: 'Consultez et gérez vos documents traités. Filtrez, triez et téléchargez le texte extrait.',
    uploadNew: 'Nouveau document',
    searchDocuments: 'Rechercher des documents par nom...',
    filterByStatus: 'Filtrer par statut',
    allStatus: 'Tous les statuts',
    sortBy: 'Trier par',
    sortByDate: 'Trier par date',
    sortByName: 'Trier par nom',
    sortBySize: 'Trier par taille',

    // Document Status
    completed: 'Terminé',
    processing: 'En cours',
    cancelled: 'Annulé',
    processingPage: (current: number, total: number) => `Traitement de la page ${current} sur ${total}`,
    status: 'Statut',
    pending: 'En attente',
    failed: 'Échoué',
    
    // Document Actions
    copyText: 'Copier le texte',
    copied: 'Copié',
    download: 'Télécharger',
    downloaded: 'Téléchargé',
    tryAgain: 'Réessayer',
    maxRetriesReached: 'Nombre maximal de tentatives atteint',
    
    // Document Preview
    sourceDocument: 'Document source',
    extractedText: 'Texte extrait',
    loadingPreview: 'Chargement de l\'aperçu...',
    retrying: 'Nouvelle tentative...',
    previewNotAvailable: 'Aperçu non disponible',
    loadingDocument: 'Chargement du document...',
    noTextExtracted: 'Aucun texte extrait pour cette page',
    page: 'Page',
    of: 'sur',
    goToPage: 'Aller à la page',

    // Zoom Controls
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    resetZoom: 'Réinitialiser le zoom',
    original: 'Original',

    // Search
    searchInDocument: 'Rechercher dans le document...',
    shortcuts: 'Raccourcis',
    navigation: 'Navigation',
    zoom: 'Zoom',
    document: 'Document',
    nextPage: 'Page suivante',
    previousPage: 'Page précédente',
    focusSearch: 'Focus recherche',

    // Document Management
    documentDetails: 'Détails du document',
    basicInfo: 'Informations de base',
    processingInfo: 'Informations de traitement',
    fileName: 'Nom du fichier',
    fileType: 'Type de fichier',
    fileSize: 'Taille du fichier',
    totalPages: 'Pages totales',
    processedPages: 'Pages traitées',
    startTime: 'Heure de début',
    endTime: 'Heure de fin',
    totalDuration: 'Durée totale',
    errorDetails: 'Détails de l\'erreur',
    processingConfiguration: 'Configuration du traitement',
    concurrentJobs: 'Tâches simultanées',
    pagesPerChunk: 'Pages par lot',
    concurrentChunks: 'Lots simultanés',
    close: 'Fermer',
    openMenu: 'Ouvrir le menu',
    viewDetails: 'Voir les détails',
    delete: 'Supprimer',
    progress: 'Progression',
    date: 'Date',
    pages: 'Pages',
    size: 'Taille',
    actions: 'Actions',
    calculating: 'Calcul en cours...',
    unknown: 'Inconnu',
    loadingDocuments: 'Chargement des documents...',
    noDocuments: 'Aucun document trouvé',
    downloadNotAvailableForCancelledFiles: 'Le téléchargement n\'est pas disponible pour les fichiers annulés',
    notStarted: 'Non démarré',
    notCompleted: 'Non terminé',
    provider: 'Fournisseur',
    language: 'Langue',

    // Document Viewer
    reset: 'Réinitialiser',
    resetTo100: 'Réinitialiser à 100%',
    textSize: 'Taille du texte',

    // Technical details and processing information about your document
    technicalDetails: 'Détails techniques et informations de traitement de votre document',
    fileInformation: 'Informations sur le fichier',
    processingDetails: 'Détails du traitement',

    // Upload UI
    dropFiles: 'Déposez les fichiers ici pour commencer le traitement',
    browseFiles: 'parcourir',
    configureToUpload: 'Configurez les paramètres de l\'API pour télécharger des fichiers',
    dragAndDrop: 'Glissez et déposez vos fichiers ici',
    orBrowse: 'ou parcourez pour choisir des fichiers ',
    supports: 'Formats supportés',
    upTo: 'Jusqu\'à',
    filesEach: 'fichiers',
    mbEach: 'Mo chacun',
    noActiveUploads: 'Aucun téléchargement actif',
    dropFilesAbove: 'Déposez vos fichiers ci-dessus pour commencer le traitement. Votre file d\'attente apparaîtra ici.',
    resumingIn: 'Reprise dans',

    processingQueue: 'File de traitement',
    pause: 'Pause',
    resume: 'Reprendre',
    rateLimitMessage: 'Limite atteinte - Le traitement reprendra automatiquement',
    cancel: 'Annuler',
    remove: 'Supprimer',
    uploadingFiles: 'Téléchargement des fichiers...',

    // Document Viewer Controls
    fitToWidth: 'Ajuster à la largeur',
    fitToHeight: 'Ajuster à la hauteur',
    fitToPage: 'Ajuster à la page',
    copyToClipboard: 'Copier dans le presse-papiers',
    downloadText: 'Télécharger le texte',
    showShortcuts: 'Afficher les raccourcis',
    textSizeSmall: 'Petit',
    textSizeMedium: 'Moyen',
    textSizeLarge: 'Grand',
    textSizeExtraLarge: 'Très grand',
    showTextSizeMenu: 'Afficher le menu de taille du texte',
    showZoomMenu: 'Afficher le menu de zoom',
    zoomLevel: 'Niveau de zoom',
    zoomInShortcut: 'Zoom avant (Ctrl +)',
    zoomOutShortcut: 'Zoom arrière (Ctrl -)',
    nextPageShortcut: 'Page suivante (→)',
    previousPageShortcut: 'Page précédente (←)',
    searchShortcut: 'Rechercher (Ctrl F)',
    copyShortcut: 'Copier (Ctrl C)',
    downloadShortcut: 'Télécharger (Ctrl D)',
    resetZoomShortcut: 'Réinitialiser le zoom (Ctrl 0)',
    toggleTextSizeShortcut: 'Changer la taille du texte (Ctrl T)',
    toggleZoomShortcut: 'Changer le zoom (Ctrl Z)',

    // Settings Dialog
    settingsTitle: 'Paramètres',
    settingsDescription: 'Personnalisez le fonctionnement de votre application de reconnaissance de texte. Nous vous aiderons à comprendre chaque option !',
    ocrTab: 'OCR',
    processingTab: 'Traitement',
    uploadTab: 'Téléchargement',
    statsTab: 'Aperçu',
    
    // OCR Settings
    textRecognitionService: 'Service de reconnaissance de texte',
    textRecognitionDescription: 'Choisissez quel service IA lira vos documents. Google et Microsoft sont tous deux excellents !',
    accessKey: 'Clé d\'accès',
    accessKeyDescription: 'Considérez cela comme votre pass VIP pour utiliser le service. Gardez-le secret !',
    serviceLocation: 'Emplacement du service',
    serviceLocationDescription: 'Choisissez la région la plus proche pour une meilleure vitesse (ex: \'westeurope\')',
    documentLanguage: 'Langue du document',
    documentLanguageDescription: 'Sélectionnez la langue principale de votre document pour une meilleure précision',
    
    // Processing Settings
    parallelProcessing: 'Traitement parallèle',
    parallelProcessingDescription: 'Traiter plusieurs documents simultanément',
    pagesPerBatchDescription: 'Nombre de pages à regrouper',
    processingSpeedDescription: 'Nombre de groupes de pages à traiter simultanément',
    autoRetry: 'Réessai automatique',
    autoRetryDescription: 'Nombre de tentatives en cas d\'échec du traitement',
    retryTiming: 'Temporisation des réessais',
    retryTimingDescription: 'Temps d\'attente entre les tentatives (en millisecondes)',
    
    // Upload Settings
    maxFileSize: 'Taille maximale de fichier',
    maxFileSizeDescription: 'Plus grande taille de fichier autorisée (Mo). PDF typique de 20 pages : 2-3 Mo',
    acceptedFiles: 'Fichiers acceptés',
    acceptedFilesDescription: 'Types de fichiers autorisés (ex: pdf, png, jpg)',
    uploadSpeed: 'Vitesse de téléchargement',
    uploadSpeedDescription: 'Nombre de fichiers à télécharger simultanément',
    
    // Stats Overview
    storageOverview: 'Aperçu du stockage',
    ocrSettings: 'Paramètres OCR',
    uploadSettings: 'Paramètres de téléchargement',
    totalResults: 'Résultats totaux',
    storageUsed: 'Stockage utilisé',
    averageSizePerDoc: 'Taille moyenne/Doc',
    maxJobs: 'Tâches max',
    retryAttempts: 'Tentatives de réessai',
    retryDelay: 'Délai de réessai',
    maxParallel: 'Max parallèle',
    fileTypes: 'Types de fichiers',
    storageLimit: 'Limite de stockage',
    loadingStatistics: 'Chargement des statistiques...',
    
    // API Validation
    validationError: 'Erreur de validation',
    apiValidationFailed: 'Échec de la validation API',
    apiValidationSuccess: 'Validation API réussie',
    apiConfigValid: 'Votre configuration API est valide.',
    unexpectedError: 'Une erreur inattendue s\'est produite',
    testApi: 'Tester l\'API',
    enterApiKey: 'Entrez votre clé API',
    hideApiKey: 'Masquer la clé API',
    showApiKey: 'Afficher la clé API'
  },
  ar: {
    // Navigation
    dashboard: 'لوحة التحكم',
    documents: 'المستندات',
    settings: 'الإعدادات',
    changeLanguage: 'تغيير اللغة',
    toggleTheme: 'تغيير تم',
    
    // Dashboard
    welcome: 'مرحباً بعودتك',
    dashboardTitle: 'لوحة تحكم التعرف على النصوص',
    dashboardDescription: 'قم بمعالجة واستخراج النص من مستنداتك. قم بتحميل ملفات PDF أو JPG أو JPEG أو PNG.',
    
    // Upload Section
    uploadDocuments: 'تحميل المستندات',
    uploadDescription: 'قم بمعالجة واستخراج النص من مستنداتك باستخدام تقنية التعرف على النصوص المتقدمة.',
    
    // Stats
    totalDocuments: 'إجمالي المستندات',
    processingStatus: 'حالة المعالجة',
    successRate: 'معدل النجاح',
    processingSpeed: 'سرعة المعالجة',
    processed: 'تمت المعالجة',
    used: 'مستخدم',
    queued: 'في قائمة الانتظار',
    rateLimited: 'تم تقييد المعدل',
    autoResuming: 'استئناف تلقائي',
    pagesPerBatch: 'صفحات لكل دفعة',
    chunks: 'أجزاء',
    
    // Recent Documents
    recentDocuments: 'المستندات الحديثة',
    recentDescription: 'المستندات التي تمت معالجتها مؤخراً وحالتها',
    viewAll: 'عرض الكل',
    
    // Alerts
    configureRequired: 'إجراء مطلوب',
    configureMessage: 'يرجى تكوين إعدادات واجهة برمجة التطبيقات للتعرف على النصوص قبل تحميل المستندات.',
    configureSettings: 'تكوين الإعدادات',
    
    // Notifications
    filesAdded: 'تمت إضافة الملفات',
    filesAddedDesc: (count: number) => `تمت إضافة ${count} ملف(ات) إلى قائمة المعالجة`,
    uploadError: 'خطأ في التحميل',
    processingCancelled: 'تم إلغاء المعالجة',
    processingCancelledDesc: 'تم إلغاء معالجة المستند',
    error: 'خطأ',
    failedToCancel: 'فشل في إلغاء المعالجة',
    failedProcess: 'فشل في معالجة الملفات',

    // Document Library
    documentsLibrary: 'مكتبة المستندات',
    processedDocuments: 'المستندات المعالجة',
    documentsDescription: 'عرض وإدارة مستنداتك المعالجة. تصفية وفرز وتحميل النص المستخرج.',
    uploadNew: 'تحميل جديد',
    searchDocuments: 'البحث عن المستندات بالاسم...',
    filterByStatus: 'تصفية حسب الحالة',
    allStatus: 'جميع الحالات',
    sortBy: 'ترتيب حسب',
    sortByDate: 'ترتيب حسب التاريخ',
    sortByName: 'ترتيب حسب الاسم',
    sortBySize: 'ترتيب حسب الحجم',

    // Document Status
    completed: 'مكتمل',
    processing: 'جاري المعالجة',
    cancelled: 'ملغى',
    processingPage: (current: number, total: number) => `معالجة الصفحة ${current} من ${total}`,
    status: 'الحالة',
    pending: 'در انتظار',
    failed: 'فشل',
    
    // Document Actions
    copyText: 'نسخ النص',
    copied: 'تم النسخ',
    download: 'تحميل',
    downloaded: 'تم التحميل',
    tryAgain: 'حاول مرة أخرى',
    maxRetriesReached: 'تم الوصول إلى الحد الأقصى للمحاولات',
    
    // Document Preview
    sourceDocument: 'المستند المصدر',
    extractedText: 'النص المستخرج',
    loadingPreview: 'جاري تحميل المعاينة...',
    retrying: 'جاري إعادة المحاولة...',
    previewNotAvailable: 'المعاينة غير متوفرة',
    loadingDocument: 'جاري تحميل المستند...',
    noTextExtracted: 'لم يتم استخراج نص من هذه الصفحة',
    page: 'صفحة',
    of: 'من',
    goToPage: 'انتقل إلى الصفحة',

    // Zoom Controls
    zoomIn: 'تكبير',
    zoomOut: 'تصغير',
    resetZoom: 'إعادة تعيين التكبير',
    original: 'الحجم الأصلي',

    // Search
    searchInDocument: 'البحث في المستند...',
    shortcuts: 'اختصارات',
    navigation: 'التنقل',
    zoom: 'تكبير',
    document: 'مستند',
    nextPage: 'الصفحة التالية',
    previousPage: 'الصفحة السابقة',
    focusSearch: 'التركيز على البحث',

    // Document Management
    documentDetails: 'تفاصيل المستند',
    basicInfo: 'اطلاعات پایه',
    processingInfo: 'اطلاعات المعالجة',
    fileName: 'اسم الملف',
    fileType: 'نوع الملف',
    fileSize: 'حجم الملف',
    totalPages: 'إجمالي الصفحات',
    processedPages: 'الصفحات المعالجة',
    startTime: 'وقت البدء',
    endTime: 'وقت الانتهاء',
    totalDuration: 'المدة الإجمالية',
    errorDetails: 'تفاصيل الخطأ',
    processingConfiguration: 'تكوين المعالجة',
    concurrentJobs: 'المهام المتزامنة',
    pagesPerChunk: 'الصفحات لكل جزء',
    concurrentChunks: 'الأجزاء المتزامنة',
    close: 'إغلاق',
    openMenu: 'فتح القائمة',
    viewDetails: 'عرض التفاصيل',
    delete: 'حذف',
    progress: 'التقدم',
    date: 'التاريخ',
    pages: 'الصفحات',
    size: 'الحجم',
    actions: 'الإجراءات',
    calculating: 'جاري الحساب...',
    unknown: 'غير معروف',
    loadingDocuments: 'جاري تحميل المستندات...',
    noDocuments: 'لم يتم العثور على مستندات',
    downloadNotAvailableForCancelledFiles: 'التحميل غير متاح للملفات الملغاة',
    notStarted: 'لم يبدأ',
    notCompleted: 'تکمیل نشده',
    provider: 'المزود',
    language: 'اللغة',

    // Document Viewer
    reset: 'إعادة تعيين',
    resetTo100: 'إعادة تعيين إلى 100%',
    textSize: 'حجم النص',

    // Technical details
    technicalDetails: 'التفاصيل التقنية ومعلومات المعالجة حول المستند',
    fileInformation: 'اطلاعات الملف',
    processingDetails: 'تفاصيل المعالجة',

    dropFiles: 'قم بإسقاط الملفات هنا لبدء المعالجة',
    browseFiles: 'تصفح',
    configureToUpload: 'قم بتكوين إعدادات واجهة برمجة التطبيقات لتحميل الملفات',
    dragAndDrop: 'فایل‌های خود را اینجا بکشید و رها کنید',
    orBrowse: 'یا برای انتخاب فایل‌ها مرور کنید',
    supports: 'يدعم',
    upTo: 'حتى',
    filesEach: 'ملفات',
    mbEach: 'ميجابايت برای هر ملف',
    noActiveUploads: 'لا توجد تحميلات نشطة',
    dropFilesAbove: 'قم بإسقاط ملفاتك أعلاه لبدء المعالجة. ستظهر قائمة الانتظار الخاصة بك هنا.',
    resumingIn: 'استئناف في',

    processingQueue: 'قائمة انتظار المعالجة',
    pause: 'إيقاف مؤقت',
    resume: 'ادامه',
    rateLimitMessage: 'تم الوصول إلى حد المعدل - ستتم استئناف المعالجة تلقائياً',
    cancel: 'إلغاء',
    remove: 'إزالة',
    uploadingFiles: 'جاري تحميل الملفات...',

    // Document Viewer Controls
    fitToWidth: 'ملاءمة للعرض',
    fitToHeight: 'ملاءمة للارتفاع',
    fitToPage: 'ملاءمة للصفحة',
    copyToClipboard: 'نسخ إلى الحافظة',
    downloadText: 'تحميل النص',
    showShortcuts: 'عرض الاختصارات',
    textSizeSmall: 'صغير',
    textSizeMedium: 'متوسط',
    textSizeLarge: 'كبير',
    textSizeExtraLarge: 'كبير جداً',
    showTextSizeMenu: 'عرض قائمة حجم النص',
    showZoomMenu: 'عرض قائمة التكبير',
    zoomLevel: 'مستوى التكبير',
    zoomInShortcut: 'تكبير (Ctrl +)',
    zoomOutShortcut: 'تصغير (Ctrl -)',
    nextPageShortcut: 'الصفحة التالية (→)',
    previousPageShortcut: 'الصفحة السابقة (←)',
    searchShortcut: 'بحث (Ctrl F)',
    copyShortcut: 'نسخ (Ctrl C)',
    downloadShortcut: 'تحميل (Ctrl D)',
    resetZoomShortcut: 'إعادة تعيين التكبير (Ctrl 0)',
    toggleTextSizeShortcut: 'تغيير حجم النص (Ctrl T)',
    toggleZoomShortcut: 'تغيير التكبير (Ctrl Z)',

    // Settings Dialog
    settingsTitle: 'الإعدادات',
    settingsDescription: 'تخصيص كيفية عمل تطبيق التعرف على النصوص. سنساعدك في فهم كل خيار!',
    ocrTab: 'OCR',
    processingTab: 'المعالجة',
    uploadTab: 'التحميل',
    statsTab: 'الملخص',
    
    // OCR Settings
    textRecognitionService: 'خدمة التعرف على النصوص',
    textRecognitionDescription: 'اختر خدمة AI التي ستقرأ مستنداتك. كل من Google وMicrosoft بسیار عالی هستند!',
    accessKey: 'مفتاح الدخول',
    accessKeyDescription: 'على أن تفكر بهذا كرمز VIP الخاص بك لاستخدام الخدمة. آن را سری بگیرید!',
    serviceLocation: 'موقع الخدمة',
    serviceLocationDescription: 'اختر المنطقة القريبة لأفضل سرعة (مثل \'westeurope\')',
    documentLanguage: 'لغة المستند',
    documentLanguageDescription: 'حدد اللغة الرئيسية لمستندك لتحسين الدقة',
    
    // Processing Settings
    parallelProcessing: 'المعالجة المتزامنة',
    parallelProcessingDescription: 'معالجة مستندات متزامنة',
    pagesPerBatchDescription: 'كم عدد الصفحات لجمعها معاً',
    processingSpeedDescription: 'كم عدد مجموعات الصفحات لمعالجتها متزامناً',
    autoRetry: 'إعادة المحاولة تلقائياً',
    autoRetryDescription: 'عدد محاولات إعادة المحاولة إذا فشل المعالج',
    retryTiming: 'موقع إعادة المحاولة',
    retryTimingDescription: 'وقت الانتظار بين محاولات الإعادة (بالمللي ثانية)',
    
    // Upload Settings
    maxFileSize: 'حجم الملف الأقصى',
    maxFileSizeDescription: 'أكبر حجم ملف مسموح به (ميجابايت). PDF عادي 20 صفحة: 2-3 ميجابايت',
    acceptedFiles: 'الملفات المقبولة',
    acceptedFilesDescription: 'أنواع الملفات المسموح بها (مثل pdf, png, jpg)',
    uploadSpeed: 'سرعة التحميل',
    uploadSpeedDescription: 'عدد الملفات لتحميلها معاً',
    
    // Stats Overview
    storageOverview: 'چشم انداز',
    ocrSettings: 'إعدادات OCR',
    uploadSettings: 'إعدادات التحميل',
    totalResults: 'نتایج کلی',
    storageUsed: 'مستفید کننده ذخیره سازی',
    averageSizePerDoc: 'حجم متوسط/Doc',
    maxJobs: 'وظایف عظمی',
    retryAttempts: 'محاولات إعادة المحاولة',
    retryDelay: 'موقع إعادة المحاولة',
    maxParallel: 'عظمی موازی',
    fileTypes: 'أنواع الملفات',
    storageLimit: 'حد ذخیره سازی',
    loadingStatistics: 'بارگذاری آمار...',
    
    // API Validation
    validationError: 'خطأ تحقق',
    apiValidationFailed: 'تحقق API ناموفق',
    apiValidationSuccess: 'تحقق API موفق',
    apiConfigValid: 'تنظیم API خود معتبر است.',
    unexpectedError: 'خطأ غیر متوقع رخ داد',
    testApi: 'تست API',
    enterApiKey: 'مفتاح API خود را وارد کنید',
    hideApiKey: 'مفتاح API خفیف کنید',
    showApiKey: 'مفتاح API نمایش دهید'
  },
  fa: {
    dashboard: 'داشبورد',
    documents: 'اسناد',
    settings: 'تنظیمات',
    changeLanguage: 'تغییر زبان',
    toggleTheme: 'تغییر تم',
    
    welcome: 'خوش آمدید',
    dashboardTitle: 'داشبورد پردازش OCR',
    dashboardDescription: 'پردازش و استخراج متن از اسناد شما. فرمت‌های قابل قبول: PDF، JPG، JPEG یا PNG.',
    
    uploadDocuments: 'بارگذاری اسناد',
    uploadDescription: 'پردازش اسناد با فناوری پیشرفته OCR.',
    
    totalDocuments: 'کل اسناد',
    processingStatus: 'وضعیت پردازش',
    successRate: 'نرخ موفقیت',
    processingSpeed: 'سرعت پردازش',
    processed: 'پردازش شده',
    used: 'استفاده شده',
    queued: 'در صف',
    rateLimited: 'محدودیت نرخ',
    autoResuming: 'ادامه خودکار',
    pagesPerBatch: 'صفحات در هر دسته',
    chunks: 'دسته‌ها',
    
    recentDocuments: 'اسناد اخیر',
    recentDescription: 'اسناد اخیراً پردازش شده و وضعیت آنها',
    viewAll: 'مشاهده همه',
    
    configureRequired: 'اقدام لازم',
    configureMessage: 'لطفاً قبل از بارگذاری اسناد، تنظیمات API را پیکربندی کنید.',
    configureSettings: 'تنظیمات پیکربندی',
    
    filesAdded: 'فایل‌ها اضافه شدند',
    filesAddedDesc: (count: number) => `${count} فایل به صف پردازش اضافه شد`,
    uploadError: 'خطای بارگذاری',
    processingCancelled: 'پردازش لغو شد',
    processingCancelledDesc: 'پردازش سند لغو شد',
    error: 'خطا',
    failedToCancel: 'لغو پردازش ناموفق بود',
    failedProcess: 'خطا در پردازش فایل‌ها',

    // Document Library
    documentsLibrary: 'کتابخانه اسناد',
    processedDocuments: 'اسناد پردازش شده',
    documentsDescription: 'مشاهده و مدیریت اسناد پردازش شده. فیلتر، مرتب‌سازی و دانلود متن استخراج شده.',
    uploadNew: 'بارگذاری جدید',
    searchDocuments: 'جستجوی اسناد با نام...',
    filterByStatus: 'فیلتر بر اساس وضعیت',
    allStatus: 'همه وضعیت‌ها',
    sortBy: 'مرتب‌سازی بر اساس',
    sortByDate: 'مرتب‌سازی بر اساس تاریخ',
    sortByName: 'مرتب‌سازی بر اساس نام',
    sortBySize: 'مرتب‌سازی بر اساس اندازه',

    // Document Status
    completed: 'تکمیل شده',
    processing: 'در حال پردازش',
    cancelled: 'لغو شده',
    processingPage: (current: number, total: number) => `پردازش صفحه ${current} از ${total}`,
    status: 'وضعیت',
    pending: 'در انتظار',
    failed: 'ناموفق',
    
    // Document Actions
    copyText: 'کپی متن',
    copied: 'کپی شد',
    download: 'تحمیل',
    downloaded: 'تم التحمیل',
    tryAgain: 'تلاش مجدد',
    maxRetriesReached: 'حداکثر تلاش‌ها انجام شد',
    
    // Document Preview
    sourceDocument: 'سند منبع',
    extractedText: 'متن استخراج شده',
    loadingPreview: 'در حال بارگذاری پیش‌نمایش...',
    retrying: 'تلاش مجدد...',
    previewNotAvailable: 'پیش‌نمایش در دسترس نیست',
    loadingDocument: 'در حال بارگذاری سند...',
    noTextExtracted: 'متنی برای این صفحه استخراج نشده است',
    page: 'صفحه',
    of: 'از',
    goToPage: 'رفتن به صفحه',

    // Zoom Controls
    zoomIn: 'بزرگنمایی',
    zoomOut: 'کوچکنمایی',
    resetZoom: 'بازنشانی بزرگنمایی',
    original: 'اندازه اصلی',

    // Search
    searchInDocument: 'جستجو در سند...',
    shortcuts: 'میانبرها',
    navigation: 'ناوبری',
    zoom: 'بزرگنمایی',
    document: 'سند',
    nextPage: 'صفحه بعد',
    previousPage: 'صفحه قبل',
    focusSearch: 'تمرکز جستجو',

    // Document Management
    documentDetails: 'جزئیات سند',
    basicInfo: 'اطلاعات پایه',
    processingInfo: 'اطلاعات پردازش',
    fileName: 'نام فایل',
    fileType: 'نوع فایل',
    fileSize: 'اندازه فایل',
    totalPages: 'کل صفحات',
    processedPages: 'صفحات پردازش شده',
    startTime: 'زمان شروع',
    endTime: 'زمان پایان',
    totalDuration: 'مدت زمان کل',
    errorDetails: 'جزئیات خطا',
    processingConfiguration: 'پیکربندی پردازش',
    concurrentJobs: 'وظایف همزمان',
    pagesPerChunk: 'صفحات در هر دسته',
    concurrentChunks: 'دسته‌های همزمان',
    close: 'بستن',
    openMenu: 'باز کردن منو',
    viewDetails: 'مشاهده جزئیات',
    delete: 'حذف',
    progress: 'پیشرفت',
    date: 'تاریخ',
    pages: 'صفحات',
    size: 'اندازه',
    actions: 'عملیات',
    calculating: 'در حال محاسبه...',
    unknown: 'نامشخص',
    loadingDocuments: 'در حال بارگذاری اسناد...',
    noDocuments: 'سندی یافت نشد',
    downloadNotAvailableForCancelledFiles: 'دانلود برای فایل‌های لغو شده در دسترس نیست',
    notStarted: 'شروع نشده',
    notCompleted: 'تکمیل نشده',
    provider: 'ارائه‌دهنده',
    language: 'زبان',

    // Document Viewer
    reset: 'بازنشانی',
    resetTo100: 'بازنشانی به 100%',
    textSize: 'اندازه متن',

    // Technical details and processing information about your document
    technicalDetails: 'جزئیات فنی و اطلاعات پردازش سند شما',
    fileInformation: 'اطلاعات فایل',
    processingDetails: 'جزئیات پردازش',

    dropFiles: 'فایل‌ها را برای شروع پردازش اینجا رها کنید',
    browseFiles: 'مرور',
    configureToUpload: 'تنظیمات API را برای بارگذاری فایل‌ها پیکربندی کنید',
    dragAndDrop: 'فایل‌های خود را اینجا بکشید و رها کنید',
    orBrowse: 'یا برای انتخاب فایل‌ها مرور کنید',
    supports: 'پشتیبانی از',
    upTo: 'تا',
    filesEach: 'فایل',
    mbEach: 'مگابایت برای هر فایل',
    noActiveUploads: 'بارگذاری فعالی وجود ندارد',
    dropFilesAbove: 'فایل‌های خود را در بالا رها کنید تا پردازش شروع شود. صف شما در اینجا نمایش داده خواهد شد.',
    resumingIn: 'از سرگیری در',

    processingQueue: 'صف پردازش',
    pause: 'توقف',
    resume: 'ادامه',
    rateLimitMessage: 'به محدودیت نرخ رسید - پردازش به طور خودکار از سر گرفته می‌شود',
    cancel: 'لغو',
    remove: 'حذف',
    uploadingFiles: 'در حال بارگذاری فایل‌ها...',

    // Document Viewer Controls
    fitToWidth: 'تنظیم به عرض',
    fitToHeight: 'تنظیم به ارتفاع',
    fitToPage: 'تنظیم به صفحه',
    copyToClipboard: 'کپی به کلیپ‌بورد',
    downloadText: 'دانلود متن',
    showShortcuts: 'نمایش میانبرها',
    textSizeSmall: 'کوچک',
    textSizeMedium: 'متوسط',
    textSizeLarge: 'بزرگ',
    textSizeExtraLarge: 'خیلی بزرگ',
    showTextSizeMenu: 'نمایش منوی اندازه متن',
    showZoomMenu: 'نمایش منوی بزرگنمایی',
    zoomLevel: 'سطح بزرگنمایی',
    zoomInShortcut: 'بزرگنمایی (Ctrl +)',
    zoomOutShortcut: 'کوچکنمایی (Ctrl -)',
    nextPageShortcut: 'صفحه بعد (→)',
    previousPageShortcut: 'صفحه قبل (←)',
    searchShortcut: 'جستجو (Ctrl F)',
    copyShortcut: 'کپی (Ctrl C)',
    downloadShortcut: 'دانلود (Ctrl D)',
    resetZoomShortcut: 'بازنشانی بزرگنمایی (Ctrl 0)',
    toggleTextSizeShortcut: 'تغییر اندازه متن (Ctrl T)',
    toggleZoomShortcut: 'تغییر بزرگنمایی (Ctrl Z)',

    // Settings Dialog
    settingsTitle: 'تنظیمات',
    settingsDescription: 'تخصیص چگونگی کار کردن برنامه تشخیص نویسه. ما به شما کمک می کنیم تا هر گزینه را درک کنید!',
    ocrTab: 'OCR',
    processingTab: 'پردازش',
    uploadTab: 'بارگذاری',
    statsTab: 'چشم انداز',
    
    // OCR Settings
    textRecognitionService: 'خدمت تشخیص نویسه',
    textRecognitionDescription: 'کدام خدمت AI برای خواندن اسناد انتخاب کنید. هر دو Google وMicrosoft بسیار عالی هستند!',
    accessKey: 'مفتاح ورود',
    accessKeyDescription: 'به عنوان یک رمز VIP برای استفاده از خدمت تفکر کنید. آن را سری بگیرید!',
    serviceLocation: 'محل خدمت',
    serviceLocationDescription: 'منطقه نزدیکتر برای بهترین سرعت انتخاب کنید (مثل \'westeurope\')',
    documentLanguage: 'لغة اسند',
    documentLanguageDescription: 'زبان اصلی اسند خود را انتخاب کنید تا دقت بهتری داشته باشد',
    
    // Processing Settings
    parallelProcessing: 'پردازش موازی',
    parallelProcessingDescription: 'مستندات بیش از یکی در یک زمان پردازش کنید',
    pagesPerBatchDescription: 'چند صفحه برای همجمع کنید',
    processingSpeedDescription: 'چند جمع صفحه برای همزمان پردازش کنید',
    autoRetry: 'إعادة المحاولة تلقائياً',
    autoRetryDescription: 'عدد محاولات إعادة المحاولة إذا فشل المعالج',
    retryTiming: 'موقع إعادة المحاولة',
    retryTimingDescription: 'وقت الانتظار بين محاولات الإعادة (بالمللي ثانية)',
    
    // Upload Settings
    maxFileSize: 'حجم الملف الأقصى',
    maxFileSizeDescription: 'أكبر حجم ملف مسموح به (ميجابايت). PDF عادي 20 صفحة: 2-3 ميجابايت',
    acceptedFiles: 'الملفات المقبولة',
    acceptedFilesDescription: 'أنواع الملفات المسموح بها (مثل pdf, png, jpg)',
    uploadSpeed: 'سرعة التحميل',
    uploadSpeedDescription: 'عدد الملفات لتحميلها معاً',
    
    // Stats Overview
    storageOverview: 'چشم انداز',
    ocrSettings: 'إعدادات OCR',
    uploadSettings: 'إعدادات التحميل',
    totalResults: 'نتایج کلی',
    storageUsed: 'مستفید کننده ذخیره سازی',
    averageSizePerDoc: 'حجم متوسط/Doc',
    maxJobs: 'وظایف عظمی',
    retryAttempts: 'محاولات إعادة المحاولة',
    retryDelay: 'موقع إعادة المحاولة',
    maxParallel: 'عظمی موازی',
    fileTypes: 'أنواع الملفات',
    storageLimit: 'حد ذخیره سازی',
    loadingStatistics: 'بارگذاری آمار...',
    
    // API Validation
    validationError: 'خطأ تحقق',
    apiValidationFailed: 'تحقق API ناموفق',
    apiValidationSuccess: 'تحقق API موفق',
    apiConfigValid: 'تنظیم API خود معتبر است.',
    unexpectedError: 'خطأ غیر متوقع رخ داد',
    testApi: 'تست API',
    enterApiKey: 'مفتاح API خود را وارد کنید',
    hideApiKey: 'مفتاح API خفیف کنید',
    showApiKey: 'مفتاح API نمایش دهید'
  }
}

export type TranslationKey = keyof TranslationKeys

export function t(key: TranslationKey, lang: Language): string {
  const translation = translations[lang][key] || translations.en[key] // Fallback to English
  if (typeof translation === 'function') {
    return translation(0, 0)  // Default both current and total to 0
  }
  return translation as string
}

export function tCount(key: TranslationKey, count: number, lang: Language): string {
  const translation = translations[lang][key] || translations.en[key] // Fallback to English
  if (typeof translation === 'function') {
    return translation(count, count)  // Use count for both parameters
  }
  return translation as string
}

// Add failedProcess key to all translations
export const translationKeys = {
  failedProcess: 'failedProcess'
} as const

// Update English translations
translations.en = {
  ...translations.en,
  failedProcess: 'Failed to process files',
}

// Update French translations
translations.fr = {
  ...translations.fr,
  failedProcess: 'Échec du traitement des fichiers',
}

// Update Arabic translations
translations.ar = {
  ...translations.ar,
  failedProcess: 'فشل في معالجة الملفات',
}

// Update Persian translations
translations.fa = {
  ...translations.fa,
  failedProcess: 'خطا در پردازش فایل‌ها',
} 