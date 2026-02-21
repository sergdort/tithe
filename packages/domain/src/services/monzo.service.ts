export interface MonzoService {
  connectStart: () => Promise<{ status: string; message: string }>;
  callback: () => Promise<{ status: string; message: string }>;
  syncNow: () => Promise<{ status: string; message: string }>;
}

export const createMonzoService = (): MonzoService => ({
  async connectStart() {
    return {
      status: 'not_configured',
      message:
        'Monzo integration scaffolded. Configure MONZO_CLIENT_ID, MONZO_CLIENT_SECRET and redirect URI to enable OAuth.',
    };
  },

  async callback() {
    return {
      status: 'not_implemented',
      message: 'OAuth callback handling is planned for Milestone 3.',
    };
  },

  async syncNow() {
    return {
      status: 'not_implemented',
      message: 'Monzo sync engine is planned for Milestone 3.',
    };
  },
});
