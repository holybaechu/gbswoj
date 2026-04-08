import { treaty } from '@elysiajs/eden';
import type { App } from '@gbswoj/backend';

const isServer = typeof window === 'undefined';
const serverUrl = isServer 
    ? (typeof process !== 'undefined' && process.env.BACKEND_URL ? process.env.BACKEND_URL : 'http://backend:3000')
    : '';

export const api = treaty<App>(serverUrl);
