const API_BASE = '/api'

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include',
      ...options
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body)
    }

    const response = await fetch(url, config)
    const data = await response.json()

    return { data, status: response.status, ok: response.ok }
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' })
  }

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body })
  }

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body })
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' })
  }

  // File upload
  async upload(endpoint, formData) {
    const url = `${API_BASE}${endpoint}`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    const data = await response.json()
    return { data, status: response.status, ok: response.ok }
  }
}

export default new ApiService()
