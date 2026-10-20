// Jest setup file — runs before each test file.
//
// Mocks `@react-native-async-storage/async-storage` with an in-memory
// implementation so Zustand stores that use the `persist` middleware
// (theme-store, navigation-store) work hermetically in unit tests
// without pulling in the native module.
//
// The mock factory is not allowed to reference out-of-scope variables
// unless they are prefixed with `mock` (case insensitive), so the
// shared map is named `mockStorage`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStorage: Map<string, string> = new Map();

jest.mock('@react-native-async-storage/async-storage', () => {
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(
        async (key: string): Promise<string | null> => mockStorage.get(key) ?? null,
      ),
      setItem: jest.fn(async (key: string, value: string): Promise<void> => {
        mockStorage.set(key, value);
      }),
      removeItem: jest.fn(async (key: string): Promise<void> => {
        mockStorage.delete(key);
      }),
      clear: jest.fn(async (): Promise<void> => {
        mockStorage.clear();
      }),
      getAllKeys: jest.fn(
        async (): Promise<readonly string[]> => Array.from(mockStorage.keys()),
      ),
      multiGet: jest.fn(
        async (keys: readonly string[]): Promise<readonly [string, string | null][]> =>
          keys.map((k) => [k, mockStorage.get(k) ?? null] as [string, string | null]),
      ),
      multiSet: jest.fn(async (entries: readonly [string, string][]): Promise<void> => {
        for (const [k, v] of entries) mockStorage.set(k, v);
      }),
      multiRemove: jest.fn(async (keys: readonly string[]): Promise<void> => {
        for (const k of keys) mockStorage.delete(k);
      }),
    },
  };
});

// Reset the in-memory storage between test files so persisted state
// from one file doesn't leak into another.
beforeEach(() => {
  mockStorage.clear();
});
