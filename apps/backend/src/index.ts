import { Elysia, t, sse } from 'elysia';
import { cors } from '@elysiajs/cors';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redis.connect().catch(console.error);

const redisSub = redis.duplicate();
redisSub.connect().then(() => {
    redisSub.pSubscribe('result_pub:*', (message, channel) => {
        const id = channel.split(':')[1];
        if (id) resultEmitter.emit(id, message);
    });
}).catch(console.error);

const resultEmitter = new EventEmitter();
resultEmitter.setMaxListeners(1000);

export const app = new Elysia({ prefix: '/api' })
    .use(cors())
    .post('/submit', async ({ body }) => {
        const id = randomUUID();
        await redis.xAdd('code_submissions', '*', {
            code: body.code,
            id: id
        });
        return {
            status: 'ok',
            submission_id: id
        };
    }, {
        body: t.Object({
            code: t.String()
        })
    })
    .get('/result/:id', async function* ({ params: { id } }) {
        let onResult!: (msg: string) => void;
        let timeoutId!: NodeJS.Timeout;

        const waitPromise = new Promise<string | null>((resolve) => {
            onResult = (msg: string) => resolve(msg);
            resultEmitter.once(id, onResult);
            timeoutId = setTimeout(() => resolve(null), 30000);
        });

        try {
            const existing = await redis.get(`result:${id}`);
            if (existing && existing !== 'PROCESSING') {
                yield sse({
                    data: {
                        status: 'completed',
                        output: existing
                    }
                });
                return;
            }

            yield sse({
                data: {
                    status: 'pending',
                    output: null
                }
            });

            // Block and wait for pub/sub event
            const output = await waitPromise;
            
            if (output !== null) {
                yield sse({
                    data: {
                        status: 'completed',
                        output
                    }
                });
            } else {
                yield sse({
                    data: {
                        status: 'timeout',
                        output: null
                    }
                });
            }
        } finally {
            resultEmitter.off(id, onResult);
            clearTimeout(timeoutId);
        }
    }, {
        params: t.Object({
            id: t.String()
        })
    })
    .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
