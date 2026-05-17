/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/setup\\.ts', '/__tests__/__mocks__/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/flash-list)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'stores/authStore.ts',
    'lib/grading.ts',
    'hooks/useReports.ts',
    'hooks/useAnnouncements.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: { lines: 40 },
  },
  forceExit: true,
};
