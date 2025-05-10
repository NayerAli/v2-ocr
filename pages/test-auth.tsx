import { useEffect, useState } from 'react'
import { authCompat } from '@/lib/auth-compat'

export default function TestAuthPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      try {
        setLoading(true)
        const user = await authCompat.getUser()
        setUser(user)
      } catch (err) {
        console.error('Error checking auth:', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Auth Compatibility Test</h1>
      
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <div className="bg-red-100 p-4 rounded">
          <h2 className="text-red-800 font-bold">Error</h2>
          <p>{error}</p>
        </div>
      ) : (
        <div className="bg-green-100 p-4 rounded">
          <h2 className="text-green-800 font-bold">Auth Status</h2>
          {user ? (
            <div>
              <p>Authenticated as: {user.email || user.id}</p>
              <pre className="bg-gray-100 p-2 mt-2 rounded overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          ) : (
            <p>Not authenticated</p>
          )}
        </div>
      )}
    </div>
  )
}
