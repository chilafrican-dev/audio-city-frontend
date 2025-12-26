import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.audiocity.app',
  appName: 'Audio City',
  webDir: '.',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*']
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'AAB' // or 'APK'
    }
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0f',
      showSpinner: false
    }
  }
};

export default config;

