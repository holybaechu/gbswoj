import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';

const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redis.connect().catch(console.error);

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
    .get('/result/:id', async ({ params: { id } }) => {
        const result = await redis.get(`result:${id}`);
        if (result) {
            return {
                status: 'completed',
                output: result
            };
        }
        return {
            status: 'pending',
            output: null
        };
    }, {
        params: t.Object({
            id: t.String()
        })
    })
    .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
