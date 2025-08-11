'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { notification } from 'antd';
import { useJamaStore } from '../stores/jamaStore';
import { globalJamaService } from '../services/globalJamaService';
import { JamaConnectionConfig } from '../jama-data/types/jama';

interface JamaContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  connectionConfig: JamaConnectionConfig | null;
  connect: (config: JamaConnectionConfig) => Promise<void>;
  disconnect: () => void;
  testConnection: () => Promise<boolean>;
  isTokenValid: boolean;
  isTokenExpiringSoon: boolean;
}

const JamaContext = createContext<JamaContextType | null>(null);

export const useJamaConnection = () => {
  const context = useContext(JamaContext);
  if (!context) {
    throw new Error('useJamaConnection must be used within a JamaConnectionProvider');
  }
  return context;
};

interface JamaConnectionProviderProps {
  children: React.ReactNode;
}

export const JamaConnectionProvider: React.FC<JamaConnectionProviderProps> = ({ children }) => {
  const {
    connectionConfig,
    isConnected,
    isConnecting,
    connectionError,
    setConnection,
    setConnecting,
    setConnectionError,
    disconnect: storeDisconnect,
    testConnection: storeTestConnection,
    isTokenValid,
    isTokenExpiringSoon,
    refreshToken,
  } = useJamaStore();

  // Auto token refresh effect
  useEffect(() => {
    if (!isConnected || !connectionConfig || connectionConfig.authType === 'basic') {
      return;
    }

    // Check every minute if token needs refresh
    const interval = setInterval(async () => {
      if (isTokenExpiringSoon()) {
        try {
          await refreshToken();
          notification.success({
            message: 'Token Refreshed',
            description: 'Jama access token has been automatically refreshed.',
            placement: 'topRight',
            duration: 3,
          });
        } catch (error) {
          notification.error({
            message: 'Token Refresh Failed',
            description: 'Failed to refresh Jama access token. Please re-authenticate.',
            placement: 'topRight',
            duration: 5,
          });
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [isConnected, connectionConfig, isTokenExpiringSoon, refreshToken]);

  // Auto-reconnect on app startup if we have stored config
  useEffect(() => {
    const storedConfig = useJamaStore.getState().connectionConfig;
    if (storedConfig && !isConnected) {
      // Try to reconnect with stored config
      connect(storedConfig).catch(() => {
        // Silent fail - user will need to reconnect manually
      });
    }
  }, []);

  const connect = async (config: JamaConnectionConfig): Promise<void> => {
    setConnecting(true);
    setConnectionError(null);

    try {
      // Import the original JamaService for connection testing
      const { JamaService } = await import('../jama-data/services/jamaService');
      const jamaService = new JamaService(config);

      // For OAuth, get token first
      if (config.authType === 'oauth') {
        if (!config.clientId || !config.clientSecret) {
          throw new Error('OAuth credentials are required');
        }

        const tokenResponse = await jamaService.getOAuthToken(
          config.clientId,
          config.clientSecret,
          config.baseUrl
        );

        config.accessToken = tokenResponse.access_token;
        config.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
      }

      // Test the connection
      const connectionSuccess = await jamaService.testConnection();
      
      if (!connectionSuccess) {
        throw new Error('Connection test failed. Please check your credentials and URL.');
      }

      // Get current user to validate connection
      const currentUser = await jamaService.getCurrentUser();
      
      // Store the successful connection
      setConnection(config);

      notification.success({
        message: 'Connected to Jama',
        description: `Successfully connected as ${currentUser.firstName} ${currentUser.lastName}`,
        placement: 'topRight',
        duration: 4,
      });

    } catch (error: any) {
      const errorMessage = error.message || 'Failed to connect to Jama';
      setConnectionError(errorMessage);
      
      notification.error({
        message: 'Connection Failed',
        description: errorMessage,
        placement: 'topRight',
        duration: 5,
      });
      
      throw error;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = (): void => {
    storeDisconnect();
    
    notification.info({
      message: 'Disconnected',
      description: 'Disconnected from Jama Connect',
      placement: 'topRight',
      duration: 3,
    });
  };

  const testConnection = async (): Promise<boolean> => {
    try {
      const result = await storeTestConnection();
      
      if (result) {
        notification.success({
          message: 'Connection Test Successful',
          description: 'Your Jama connection is working properly',
          placement: 'topRight',
          duration: 3,
        });
      } else {
        notification.error({
          message: 'Connection Test Failed',
          description: 'Unable to connect to Jama. Please check your connection.',
          placement: 'topRight',
          duration: 5,
        });
      }
      
      return result;
    } catch (error: any) {
      notification.error({
        message: 'Connection Test Failed',
        description: error.message || 'Connection test failed',
        placement: 'topRight',
        duration: 5,
      });
      return false;
    }
  };

  const value: JamaContextType = {
    isConnected,
    isConnecting,
    connectionError,
    connectionConfig,
    connect,
    disconnect,
    testConnection,
    isTokenValid: isTokenValid(),
    isTokenExpiringSoon: isTokenExpiringSoon(),
  };

  return (
    <JamaContext.Provider value={value}>
      {children}
    </JamaContext.Provider>
  );
};
