import { ipcRenderer } from 'electron';
import { API_URL } from '../../urlConfig';
import { getAssetPath } from './assetPath';

class ApiClient {
    private async getAuthHeaders(): Promise<Record<string, string>> {
        try {
            const result = await ipcRenderer.invoke('auth:get-user-info');
            console.log('Auth result:', result);

            if (!result.success || !result.token) {
                throw new Error('Authentication required');
            }

            return {
                Authorization: `Bearer ${result.token}`,
                Accept: 'application/json',
            };
        } catch (error) {
            console.error('Failed to get auth headers:', error);
            throw error;
        }
    }

    async get<T>(endpoint: string): Promise<T> {
        try {
            const headers = await this.getAuthHeaders();
            console.log('Making request with headers:', headers);

            console.log('Making request to:', `${API_URL}${endpoint}`);
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error(`API GET error for ${endpoint}:`, error);

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
                    url: getAssetPath('images/placeholder.png'),
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
