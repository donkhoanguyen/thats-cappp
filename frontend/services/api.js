// API configuration
const API_BASE_URL = 'http://localhost:8000';

// API endpoints
const ENDPOINTS = {
  EXTRACT_CONTENT: '/ws/start-listening',
  // Add more endpoints here as needed
};

// API service class
class ApiService {
  static async post(endpoint, data) {
    try {
      // For Chrome extensions, we'll use the background script to make the request
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          method: 'POST',
          endpoint: `${API_BASE_URL}${endpoint}`,
          data: data
        }, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        });
      });
    } catch (error) {
      console.error(`API call failed:`, error);
      throw error;
    }
  }

  static async get(endpoint, params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = `${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;
      
      // For Chrome extensions, we'll use the background script to make the request
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          method: 'GET',
          endpoint: url
        }, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        });
      });
    } catch (error) {
      console.error(`API call failed:`, error);
      throw error;
    }
  }
}

// Export the API service and endpoints
export { ApiService, ENDPOINTS }; 