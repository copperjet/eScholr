/**
 * Supabase mock — returns configurable data for unit tests.
 * Call mockSupabaseData() in beforeEach to set per-test payloads.
 */

type MockPayload = { data: any; error: any };

let mockPayloads: Record<string, MockPayload> = {};

export function mockSupabaseData(overrides: Record<string, MockPayload>) {
  mockPayloads = { ...overrides };
}

export function resetSupabaseMock() {
  mockPayloads = {};
}

const chainable = (table: string): any => {
  const payload = mockPayloads[table] ?? { data: [], error: null };
  const q: any = {
    select: () => q,
    insert: jest.fn(() => q),
    update: jest.fn(() => q),
    upsert: jest.fn(() => q),
    delete: jest.fn(() => q),
    eq: () => q,
    neq: () => q,
    in: () => q,
    not: () => q,
    is: () => q,
    contains: () => q,
    order: () => q,
    limit: () => q,
    single: () => Promise.resolve(payload),
    maybeSingle: () => Promise.resolve(payload),
    then: (resolve: any) => Promise.resolve(payload).then(resolve),
  };
  return q;
};

export const supabase = {
  from: (table: string) => chainable(table),
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: { school_id: 'school-1', roles: ['admin'], active_role: 'admin' } } }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' }, session: { access_token: 'tok' } }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    updateUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  },
  storage: {
    from: () => ({
      upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.pdf' } }),
    }),
  },
  functions: {
    invoke: jest.fn().mockResolvedValue({ data: {}, error: null }),
  },
  channel: jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  }),
  removeChannel: jest.fn(),
};
