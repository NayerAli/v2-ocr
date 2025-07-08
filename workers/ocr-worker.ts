import { getProcessingService } from '@/lib/processing-service'
import type { OCRSettings, ProcessingSettings, UploadSettings } from '@/types/settings'

let service: Awaited<ReturnType<typeof getProcessingService>> | null = null

interface InitMessage {
  type: 'init'
  settings: {
    ocr: OCRSettings
    processing: ProcessingSettings
    upload: UploadSettings
  }
}

interface AddMessage {
  type: 'addFiles'
  files: File[]
}

interface CommandMessage {
  type: 'pause' | 'resume' | 'cancel' | 'retry'
  id?: string
}

type WorkerMessage = InitMessage | AddMessage | CommandMessage

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data
  switch (msg.type) {
    case 'init':
      service = await getProcessingService(msg.settings)
      self.postMessage({ type: 'ready' })
      break
    case 'addFiles':
      if (!service) return
      await service.addToQueue(msg.files)
      break
    case 'pause':
      await service?.pauseQueue()
      break
    case 'resume':
      await service?.resumeQueue()
      break
    case 'cancel':
      if (msg.id) await service?.cancelProcessing(msg.id)
      break
    case 'retry':
      if (msg.id) await service?.retryDocument(msg.id)
      break
  }
}

export {}
