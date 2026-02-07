import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novel.reading.app',
  appName: 'Novel Reading App',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Firebase login",
        biometricSubTitle: "Log in using your biometric"
      }
    }
  }
};

export default config;
