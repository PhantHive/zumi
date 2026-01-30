import { ipcRenderer } from 'electron';
import { API_URL } from '../../urlConfig';
import { getAssetPath } from './assetPath';

class ApiClient {
    private runtimeApiBase: string | null = null;

    private async getAuthHeaders(): Promise<Record<string, string>> {
        // Try to get auth headers; if token not yet available, poll for a short timeout
        const maxAttempts = 15;
        const delayMs = 300;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await ipcRenderer.invoke('auth:get-user-info');
                console.log('Auth result (attempt', attempt, '):', result);

                if (result && result.success && result.token) {
                    return {
                        Authorization: `Bearer ${result.token}`,
                        Accept: 'application/json',
                    };
                }

                // If not available, wait and retry
                if (attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, delayMs));
                    continue;
                }

                throw new Error('Authentication required (token not available)');
            } catch (error) {
                // If this was the last attempt, throw, otherwise wait and retry
                console.warn(`getAuthHeaders attempt ${attempt} failed:`, error instanceof Error ? error.message : error);
                if (attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, delayMs));
                    continue;
                }
                throw error;
            }
        }

        throw new Error('Failed to obtain auth headers');
    }

    // Helper: fetch with timeout
    private async fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 1200) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(input, { ...init, signal: controller.signal });
            return resp;
        } finally {
            clearTimeout(id);
        }
    }

    // Helper: attempt to discover an API base URL by probing candidate ports on localhost
    private async discoverBaseUrl(endpoint: string): Promise<string | null> {
        const seen = new Set<string>();
        const candidates: Array<string | number> = [];

        // runtime override from window or process (in renderer)
        const runtimePort = (typeof window !== 'undefined' && (window as any).__API_PORT__) ||
            (typeof process !== 'undefined' && process.env && process.env.API_PORT);
        if (runtimePort) candidates.push(runtimePort);

        // common dev ports
        candidates.push(3000, 31856, 8080, 5000);

        for (const p of candidates) {
            if (!p) continue;
            const port = String(p);
            if (seen.has(port)) continue;
            seen.add(port);

            const url = `http://localhost:${port}${endpoint}`;
            try {
                // quick probe: HEAD first, fallback to GET if HEAD not allowed
                const headResp = await this.fetchWithTimeout(url, { method: 'HEAD' }, 800);
                if (headResp && (headResp.ok || headResp.status === 200 || headResp.status === 204 || headResp.status === 405)) {
                    // OK or method not allowed (405) - consider it reachable
                    return `http://localhost:${port}`;
                }
                // If HEAD returned something non-OK but not connection error, try GET quickly
                const getResp = await this.fetchWithTimeout(url, { method: 'GET' }, 1000);
                if (getResp && getResp.ok) return `http://localhost:${port}`;
            } catch (err) {
                // ignore and continue
                console.debug(`Probe failed for port ${port}:`, err instanceof Error ? err.message : err);
                continue;
            }
        }

        return null;
    }

    private async resolveRuntimeApiBase() {
        if (this.runtimeApiBase) return this.runtimeApiBase;
        try {
            // If main already exposed API port via window, use it
            if (typeof window !== 'undefined' && (window as any).__API_PORT__) {
                const port = (window as any).__API_PORT__;
                this.runtimeApiBase = `http://localhost:${port}`;
                console.log('Resolved runtime API base from window.__API_PORT__:', this.runtimeApiBase);
                return this.runtimeApiBase;
            }

            // Wait for main-ready event (renderer sets window.__API_PORT__ there); timeout after 2s
            if (ipcRenderer && typeof ipcRenderer.once === 'function') {
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => resolve(), 2000);
                    try {
                        ipcRenderer.once('main-ready', (_event, data) => {
                            clearTimeout(timeout);
                            if (data && data.apiPort) {
                                (window as any).__API_PORT__ = data.apiPort;
                                this.runtimeApiBase = `http://localhost:${data.apiPort}`;
                                console.log('Resolved runtime API base from main-ready event:', this.runtimeApiBase);
                            }
                            resolve();
                        });
                    } catch (err) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            }

            // Ask main process for configured API port (if still not set)
            try {
                const port = await ipcRenderer.invoke('get-runtime-api-port');
                if (port) {
                    this.runtimeApiBase = `http://localhost:${port}`;
                    (window as any).__API_PORT__ = String(port);
                    console.log('Resolved runtime API base from main IPC:', this.runtimeApiBase);
                    return this.runtimeApiBase;
                }
            } catch (err) {
                console.warn('get-runtime-api-port failed or not available yet:', err);
            }
        } catch (err) {
            console.warn('resolveRuntimeApiBase encountered error:', err);
        }

        // Fallback to configured API_URL
        try {
            const u = new URL(API_URL);
            this.runtimeApiBase = `${u.origin}`;
            return this.runtimeApiBase;
        } catch (err) {
            console.warn('Failed to parse API_URL fallback:', err);
            return null;
        }
    }

    async get<T>(endpoint: string): Promise<T> {
        const base = (await this.resolveRuntimeApiBase()) || API_URL;
        try {
            const headers = await this.getAuthHeaders();
            console.log('Making request with headers:', headers);

            const full = `${base.replace(/\/$/, '')}${endpoint}`;
            console.log('Making request to:', full);
            const response = await fetch(full, { method: 'GET', headers });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            return response.json();
        } catch (error) {
            console.error(`API GET error for ${endpoint}:`, error);
            // previous discovery fallback kept as last resort
            try {
                const discoveredBase = await this.discoverBaseUrl(endpoint);
                if (discoveredBase) {
                    const headers = await this.getAuthHeaders().catch(() => ({} as Record<string,string>));
                    const discoveredResp = await fetch(`${discoveredBase}${endpoint}`, { method: 'GET', headers });
                    if (discoveredResp.ok) {
                        try { (window as any).__API_PORT__ = new URL(discoveredBase).port; } catch(e){}
                        console.log('Using discovered API base:', discoveredBase);
                        return discoveredResp.json();
                    }
                }
            } catch (retryErr) {
                console.error('API retry/discovery also failed:', retryErr);
            }

            throw error;
        }
    }

    async post<T>(endpoint: string, data: unknown): Promise<T> {
        try {
            const headers = await this.getAuthHeaders();
            const isFormData = data instanceof FormData;

            const requestHeaders = {
                ...headers,
                ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            };

            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: requestHeaders,
                body: isFormData ? data : JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error(`API POST error for ${endpoint}:`, error);
            throw error;
        }
    }

    async getStream(endpoint: string) {
        try {
            const headers = await this.getAuthHeaders();
            console.log('Stream request for:', `${API_URL}${endpoint}`);
            console.log('With headers:', headers);

            const response = await fetch(`${API_URL}${endpoint}`, {
                headers,
            });

            if (!response.ok) {
                // Log the error response for debugging
                const errorText = await response.text();
                console.error('Stream error response:', errorText);

                throw new Error(
                    `Stream Error: ${response.status} - ${response.statusText}`,
                );
            }

            const contentType = response.headers.get('content-type');
            if (!contentType) {
                throw new Error('No content type received from server');
            }

            console.log('Received content type:', contentType);

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            return {
                url: objectUrl,
                headers,
                cleanup: () => URL.revokeObjectURL(objectUrl),
                contentType,
            };
        } catch (error) {
            console.error(`Stream error for ${endpoint}:`, error);
            // If this is a thumbnail request, we could return a placeholder
            if (endpoint.includes('thumbnails')) {
                return {
                    url: getAssetPath('images/placeholder.jpg'),
                    headers: {},
                    cleanup: () => {},
                    contentType: 'image/jpeg',
                };
            }
            throw error;
        }
    }
}

export const apiClient = new ApiClient();
