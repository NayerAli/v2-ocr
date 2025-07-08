'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useSettings } from '@/store/settings'

// eslint-disable-next-line import/no-webpack-loader-syntax
const workerUrl = new URL('../workers/ocr-worker.ts', import.meta.url)

interface WorkerContextValue {
  worker: Worker | null
  isReady: boolean
}

const ProcessingWorkerContext = createContext<WorkerContextValue>({ worker: null, isReady: false })

export function ProcessingWorkerProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings()
  const workerRef = useRef<Worker | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const worker = new Worker(workerUrl, { type: 'module' })
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ready') {
        setIsReady(true)
      }
    }
    worker.addEventListener('message', handleMessage)
    workerRef.current = worker
    worker.postMessage({
      type: 'init',
      settings: { ocr: settings.ocr, processing: settings.processing, upload: settings.upload },
    })
    return () => {
      worker.removeEventListener('message', handleMessage)
      worker.terminate()
      workerRef.current = null
      setIsReady(false)
    }
  }, [settings.ocr, settings.processing, settings.upload])

  return (
    <ProcessingWorkerContext.Provider value={{ worker: workerRef.current, isReady }}>
      {children}
    </ProcessingWorkerContext.Provider>
  )
}

export function useProcessingWorker() {
  return useContext(ProcessingWorkerContext)
}
