import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

const CREDENTIALS_SERVER = 'app.tidywise.staff';

interface BiometricCredentials {
  email: string;
  password: string;
}

// Lazy load the biometric plugin only when needed
const getBiometricPlugin = async () => {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    return NativeBiometric;
  } catch (error) {
    console.log('Biometric plugin not available:', error);
    return null;
  }
};

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState<number | null>(null);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      checkBiometricAvailability();
    }
  }, []);

  const checkBiometricAvailability = async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const NativeBiometric = await getBiometricPlugin();
      if (!NativeBiometric) return;

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
      const NativeBiometric = await getBiometricPlugin();
      if (!NativeBiometric) return false;

      await NativeBiometric.getCredentials({ server: CREDENTIALS_SERVER });
      return true;
    } catch {
      return false;
    }
  };

  const storeCredentials = async (email: string, password: string): Promise<boolean> => {
    if (!isAvailable) return false;

    try {
      const NativeBiometric = await getBiometricPlugin();
      if (!NativeBiometric) return false;

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
      const NativeBiometric = await getBiometricPlugin();
      if (!NativeBiometric) return null;

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
      const NativeBiometric = await getBiometricPlugin();
      if (!NativeBiometric) return false;

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
    // BiometryType enum values from capacitor-native-biometric
    // 1 = TOUCH_ID, 2 = FACE_ID, 3 = FINGERPRINT, 4 = FACE_AUTHENTICATION, 5 = IRIS_AUTHENTICATION
    switch (biometryType) {
      case 2: // FACE_ID
        return 'Face ID';
      case 1: // TOUCH_ID
        return 'Touch ID';
      case 3: // FINGERPRINT
        return 'Fingerprint';
      case 4: // FACE_AUTHENTICATION
        return 'Face Recognition';
      case 5: // IRIS_AUTHENTICATION
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
