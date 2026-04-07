import { treaty } from '@elysiajs/eden';
import type { App } from '@gbswoj/backend';

const serverUrl = typeof window === 'undefined' ? 'http://backend:3000' : 'http://127.0.0.1:3000';

export const api = treaty<App>(serverUrl);
