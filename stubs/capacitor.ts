// Local stubs used only for browser previews when @capacitor packages are not installed.
export const registerPlugin = <T,>(_: string): T => ({ set: async () => {}, getInsets: async () => ({}), addListener: async () => ({ remove: () => {} }) }) as unknown as T;
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', convertFileSrc: (u: string) => u };
export const Filesystem = {
  writeFile: async (_: unknown) => ({ uri: '' }),
  readdir: async (_: unknown) => ({ files: [] as { name: string }[] }),
  deleteFile: async (_: unknown) => {},
  readFile: async (_: unknown) => ({ data: '' as string | Blob }),
  appendFile: async (_: unknown) => {},
  rename: async (_: unknown) => {},
  copy: async (_: unknown) => {},
  getUri: async (_: unknown) => ({ uri: '' }),
};
export const Directory = { Cache: 'CACHE', Data: 'DATA', Documents: 'DOCUMENTS' } as const;
export type Directory = (typeof Directory)[keyof typeof Directory];
export const Encoding = { UTF8: 'utf8' } as const;
export const Share = { share: async (_: unknown) => {} };
export const StatusBar = { setStyle: async (_: unknown) => {}, setBackgroundColor: async (_: unknown) => {} };
export const Style = { Dark: 'DARK', Light: 'LIGHT' } as const;
export const Haptics = { impact: async (_: unknown) => {} };
export const ImpactStyle = { Light: 'LIGHT' } as const;
export const Keyboard = { addListener: (_: string, __: (i: { keyboardHeight: number }) => void) => ({ remove: () => {} }) };
export const App = { addListener: (_: string, __: () => void) => ({ remove: () => {} }), minimizeApp: async () => {} };
export const LocalNotifications = {
  checkPermissions: async () => ({ display: 'denied' as string }),
  requestPermissions: async () => ({ display: 'denied' as string }),
  getPending: async () => ({ notifications: [] as { id: number }[] }),
  cancel: async (_: unknown) => {},
  schedule: async (_: unknown) => {},
};
