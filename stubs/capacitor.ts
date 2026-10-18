// Local stubs used only for browser previews when @capacitor packages are not installed.
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
export const Filesystem = { writeFile: async (_: unknown) => ({ uri: '' }) };
export const Directory = { Cache: 'CACHE' } as const;
export const Encoding = { UTF8: 'utf8' } as const;
export const Share = { share: async (_: unknown) => {} };
export const StatusBar = { setStyle: async (_: unknown) => {}, setBackgroundColor: async (_: unknown) => {} };
export const Style = { Dark: 'DARK', Light: 'LIGHT' } as const;
export const Haptics = { impact: async (_: unknown) => {} };
export const ImpactStyle = { Light: 'LIGHT' } as const;
