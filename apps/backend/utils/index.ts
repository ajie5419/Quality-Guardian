export const MOCK_DELAY = 100;

export async function awaitMockDelay(delay = MOCK_DELAY): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export * from './cookie-utils';
export * from './jwt-utils';
export * from './response';
