// ABOUTME: Jest configuration for ESM TypeScript testing
// ABOUTME: Uses ts-jest with ESM preset for MCP server tests

/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  injectGlobals: true,
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext'
        }
      }
    ]
  },
  extensionsToTreatAsEsm: ['.ts'],
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 40,
      lines: 20,
      statements: 20
    }
  }
};
