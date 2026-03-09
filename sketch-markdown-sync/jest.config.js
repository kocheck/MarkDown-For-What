module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/?(*.)+(spec|test).ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    collectCoverageFrom: [
        'src/parser.ts',
        'src/utils.ts',
        'src/settings.ts',
        'src/renderer.ts',
        'src/styles.ts',
        'src/tables.ts',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/dist/**',
    ],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: {
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                },
            },
        ],
    },
};
