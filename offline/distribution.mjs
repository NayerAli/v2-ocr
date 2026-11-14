// Cloudflare Worker for the private R2 bucket. A 256-bit channel identifier is a bearer link.
const objectPath = /^\/[a-f0-9]{64}\/(?:install\.ps1|manifest\.json|objects\/[a-f0-9]{64})$/

export default {
  async fetch(request, { RELEASES }) {
    const { pathname } = new URL(request.url)
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff' }
    if (!objectPath.test(pathname)) return new Response(null, { status: 404, headers })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } })
    }
    const key = pathname.slice(1)
    const metadata = await RELEASES.head(key)
    if (!metadata) return new Response(null, { status: 404, headers })
    headers['Content-Type'] = metadata.httpMetadata?.contentType || 'application/octet-stream'
    headers['Content-Length'] = String(metadata.size)
    headers['Accept-Ranges'] = 'bytes'
    headers.ETag = metadata.httpEtag
    if (request.method === 'HEAD') return new Response(null, { headers })

    const range = request.headers.get('Range')
    if (!range) {
      const object = await RELEASES.get(key, { onlyIf: { etagMatches: metadata.etag } })
      if (!object?.body) return new Response(null, { status: 503, headers: { 'Retry-After': '1' } })
      return new Response(object.body, { headers })
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(range)
    const start = match ? Number(match[1]) : NaN
    const end = match && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1
    if (!Number.isSafeInteger(start) || start >= metadata.size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers,
        'Content-Length': '0', 'Content-Range': `bytes */${metadata.size}` } })
    }
    const length = end - start + 1
    const object = await RELEASES.get(key, {
      range: { offset: start, length }, onlyIf: { etagMatches: metadata.etag },
    })
    if (!object?.body) return new Response(null, { status: 503, headers: { 'Retry-After': '1' } })
    return new Response(object.body, { status: 206, headers: { ...headers,
      'Content-Length': String(length), 'Content-Range': `bytes ${start}-${end}/${metadata.size}` } })
  },
}
