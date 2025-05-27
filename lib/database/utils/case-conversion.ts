// Helper functions to convert between camelCase and snake_case

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const snakeToCamel = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel)
  }

  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    acc[camelKey] = snakeToCamel(obj[key])
    return acc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as any)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const camelToSnake = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake)
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)

    // Special case for 'id' which should remain as is
    const finalKey = key === 'id' ? 'id' : snakeKey

    // Skip File objects
    if (typeof window !== 'undefined' && obj[key] instanceof File) {
      // Skip File objects as they can't be serialized
      // We already handle this in saveToQueue by destructuring
    }
    // Handle Date objects
    else if (obj[key] instanceof Date) {
      acc[finalKey] = obj[key].toISOString()
    }
    // Handle other objects
    else if (typeof obj[key] === 'object' && obj[key] !== null) {
      acc[finalKey] = camelToSnake(obj[key])
    }
    // Handle primitive values
    else {
      acc[finalKey] = obj[key]
    }

    return acc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as any)
}
