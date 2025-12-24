import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric, BiometryType } from 'capacitor-native-biometric';
import { toast } from 'sonner';

const CREDENTIALS_SERVER = 'app.tidywise.staff';

interface BiometricCredentials {
  email: string;
  password: string;
}

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryType | null>(null);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const result = await NativeBiometric.isAvailable();
      setIsAvailable(result.isAvailable);
      setBiometryType(result.biometryType);
      
      // Check if we have stored credentials
      if (result.isAvailable) {
        const hasCredentials = await checkStoredCredentials();
        setHasStoredCredentials(hasCredentials);
      }
    } catch (error) {
      console.log('Biometric not available:', error);
      setIsAvailable(false);
    }
  };

  const checkStoredCredentials = async (): Promise<boolean> => {
    try {
      // Try to get credentials - if it fails, no credentials stored
      await NativeBiometric.getCredentials({ server: CREDENTIALS_SERVER });
      return true;
    } catch {
      return false;
    }
  };

  const storeCredentials = async (email: string, password: string): Promise<boolean> => {
    if (!isAvailable) return false;

    try {
      await NativeBiometric.setCredentials({
        username: email,
        password: password,
        server: CREDENTIALS_SERVER,
      });
      setHasStoredCredentials(true);
      return true;
    } catch (error) {
      console.error('Error storing credentials:', error);
      return false;
    }
  };

  const authenticateAndGetCredentials = async (): Promise<BiometricCredentials | null> => {
    if (!isAvailable || !hasStoredCredentials) return null;

    try {
      // Verify with biometrics first
      await NativeBiometric.verifyIdentity({
        reason: 'Sign in to TidyWise',
        title: 'Biometric Login',
        subtitle: 'Use Face ID or Touch ID to sign in',
        description: 'Quick and secure login',
      });

      // Get stored credentials after successful verification
      const credentials = await NativeBiometric.getCredentials({
        server: CREDENTIALS_SERVER,
      });

      return {
        email: credentials.username,
        password: credentials.password,
      };
    } catch (error) {
      console.error('Biometric auth failed:', error);
      return null;
    }
  };

  const deleteCredentials = async (): Promise<boolean> => {
    try {
      await NativeBiometric.deleteCredentials({
        server: CREDENTIALS_SERVER,
      });
      setHasStoredCredentials(false);
      return true;
    } catch (error) {
      console.error('Error deleting credentials:', error);
      return false;
    }
  };

  const getBiometryTypeName = (): string => {
    switch (biometryType) {
      case BiometryType.FACE_ID:
        return 'Face ID';
      case BiometryType.TOUCH_ID:
        return 'Touch ID';
      case BiometryType.FINGERPRINT:
        return 'Fingerprint';
      case BiometryType.FACE_AUTHENTICATION:
        return 'Face Recognition';
      case BiometryType.IRIS_AUTHENTICATION:
        return 'Iris';
      default:
        return 'Biometric';
    }
  };

  return {
    isAvailable,
    biometryType,
    hasStoredCredentials,
    getBiometryTypeName,
    storeCredentials,
    authenticateAndGetCredentials,
    deleteCredentials,
  };
}
