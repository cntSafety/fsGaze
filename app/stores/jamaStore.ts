import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { JamaConnectionConfig, JamaTokenResponse } from "../jama-data/types/jama";
import { JamaService } from "../jama-data/services/jamaService";

export interface JamaStoreState {
  // Connection state
  connectionConfig: JamaConnectionConfig | null;
  isConnected: boolean;
  isConnecting: boolean;
  
  // Token management
  tokenRefreshPromise: Promise<void> | null;
  
  // Error handling
  connectionError: string | null;
  
  // Last connection test
  lastConnectionTest: number | null;
  
  // Actions
  setConnection: (config: JamaConnectionConfig) => void;
  updateToken: (tokenData: JamaTokenResponse) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  refreshToken: () => Promise<void>;
  isTokenValid: () => boolean;
  isTokenExpiringSoon: () => boolean;
  getJamaService: () => JamaService | null;
  testConnection: () => Promise<boolean>;
  ensureValidToken: () => Promise<void>;
}

export const useJamaStore = create<JamaStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      connectionConfig: null,
      isConnected: false,
      isConnecting: false,
      tokenRefreshPromise: null,
      connectionError: null,
      lastConnectionTest: null,

      // Set connection configuration
      setConnection: (config: JamaConnectionConfig) => {
        set({
          connectionConfig: config,
          isConnected: true,
          connectionError: null,
          lastConnectionTest: Date.now(),
        });
      },

      // Update token information
      updateToken: (tokenData: JamaTokenResponse) => {
        const currentConfig = get().connectionConfig;
        if (currentConfig) {
          const updatedConfig = {
            ...currentConfig,
            accessToken: tokenData.access_token,
            tokenExpiry: Date.now() + (tokenData.expires_in * 1000),
          };
          set({
            connectionConfig: updatedConfig,
            connectionError: null,
          });
        }
      },

      // Disconnect and clear all data
      disconnect: () => {
        set({
          connectionConfig: null,
          isConnected: false,
          isConnecting: false,
          tokenRefreshPromise: null,
          connectionError: null,
          lastConnectionTest: null,
        });
      },

      // Set connecting state
      setConnecting: (connecting: boolean) => {
        set({ isConnecting: connecting });
      },

      // Set connection error
      setConnectionError: (error: string | null) => {
        set({ connectionError: error });
      },

      // Check if current token is valid (not expired)
      isTokenValid: (): boolean => {
        const config = get().connectionConfig;
        if (!config) return false;
        
        if (config.authType === 'basic') return true; // Basic auth doesn't expire
        
        if (!config.accessToken || !config.tokenExpiry) return false;
        
        return Date.now() < config.tokenExpiry;
      },

      // Check if token is expiring soon (within 5 minutes)
      isTokenExpiringSoon: (): boolean => {
        const config = get().connectionConfig;
        if (!config || config.authType === 'basic') return false;
        
        if (!config.tokenExpiry) return false;
        
        const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
        return fiveMinutesFromNow >= config.tokenExpiry;
      },

      // Refresh OAuth token
      refreshToken: async (): Promise<void> => {
        const state = get();
        const config = state.connectionConfig;
        
        if (!config || config.authType !== 'oauth') {
          throw new Error('Cannot refresh token: No OAuth configuration available');
        }

        if (!config.clientId || !config.clientSecret) {
          throw new Error('Cannot refresh token: Missing OAuth credentials');
        }

        // If there's already a refresh in progress, wait for it
        if (state.tokenRefreshPromise) {
          return state.tokenRefreshPromise;
        }

        const refreshPromise = (async () => {
          try {
            set({ isConnecting: true, connectionError: null });
            
            const jamaService = new JamaService(config);
            const tokenData = await jamaService.getOAuthToken(
              config.clientId!,
              config.clientSecret!,
              config.baseUrl
            );
            
            get().updateToken(tokenData);
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
            set({ connectionError: errorMessage });
            throw error;
          } finally {
            set({ 
              isConnecting: false,
              tokenRefreshPromise: null,
            });
          }
        })();

        set({ tokenRefreshPromise: refreshPromise });
        return refreshPromise;
      },

      // Get JamaService instance with current configuration
      getJamaService: (): JamaService | null => {
        const config = get().connectionConfig;
        if (!config || !get().isConnected) return null;
        
        return new JamaService(config);
      },

      // Test current connection
      testConnection: async (): Promise<boolean> => {
        const jamaService = get().getJamaService();
        if (!jamaService) return false;

        try {
          set({ connectionError: null });
          const isValid = await jamaService.testConnection();
          
          if (isValid) {
            set({ lastConnectionTest: Date.now() });
          } else {
            set({ connectionError: 'Connection test failed' });
          }
          
          return isValid;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
          set({ connectionError: errorMessage });
          return false;
        }
      },

      // Ensure token is valid, refresh if needed
      ensureValidToken: async (): Promise<void> => {
        const state = get();
        
        if (!state.isConnected || !state.connectionConfig) {
          throw new Error('No active Jama connection');
        }

        // Basic auth doesn't need token refresh
        if (state.connectionConfig.authType === 'basic') {
          return;
        }

        // If token is still valid and not expiring soon, we're good
        if (state.isTokenValid() && !state.isTokenExpiringSoon()) {
          return;
        }

        // Refresh the token
        await state.refreshToken();
      },
    }),
    {
      name: 'jama-connection-storage',
      storage: createJSONStorage(() => localStorage),
      // Persist connection data with session-based token storage
      partialize: (state) => ({
        connectionConfig: state.connectionConfig ? {
          baseUrl: state.connectionConfig.baseUrl,
          authType: state.connectionConfig.authType,
          clientId: state.connectionConfig.clientId,
          // For OAuth, persist tokens but not the client secret
          ...(state.connectionConfig.authType === 'oauth' ? {
            accessToken: state.connectionConfig.accessToken,
            tokenExpiry: state.connectionConfig.tokenExpiry,
          } : {}),
          // For basic auth, persist username but not password
          ...(state.connectionConfig.authType === 'basic' ? {
            username: state.connectionConfig.username,
          } : {}),
        } : null,
        isConnected: state.isConnected && state.connectionConfig?.authType === 'basic' ? true : false, // Only auto-connect basic auth
        lastConnectionTest: state.lastConnectionTest,
      }),
    }
  )
);
