const { CapacitorConfig } = require('@capacitor/cli');

const config = {
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
      releaseType: 'APK' // Change to 'AAB' for Play Store
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

module.exports = config;

