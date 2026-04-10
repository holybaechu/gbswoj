import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { createClient, type RedisClientType } from 'redis';

export interface SubmissionCreatedResponse {
  status: 'ok';
  submissionId: string;
}

export interface SubmissionResultEvent {
  status: 'pending' | 'completed' | 'timeout';
  output: string | null;
}

@Injectable()
export class SubmissionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionsService.name);
  private readonly redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  private readonly redisClient: RedisClientType = createClient({
    url: this.redisUrl,
  });
  private readonly redisSubscriber: RedisClientType =
    this.redisClient.duplicate();
  private readonly resultEmitter = new EventEmitter();
  private readonly submissionStreamKey = 'code_submissions';
  private readonly resultChannelPattern = 'result_pub:*';
  private readonly processingStatus = 'PROCESSING';
  private readonly resultTimeoutMs = 30_000;

  constructor() {
    this.resultEmitter.setMaxListeners(1000);
  }

  async onModuleInit(): Promise<void> {
    this.redisClient.on('error', (error) => {
      this.logger.error(error instanceof Error ? error.message : String(error));
    });
    this.redisSubscriber.on('error', (error) => {
      this.logger.error(error instanceof Error ? error.message : String(error));
    });

    await this.redisClient.connect();
    await this.redisSubscriber.connect();
    await this.redisSubscriber.pSubscribe(
      this.resultChannelPattern,
      (message: string, channel: string) => {
        const submissionId = channel.split(':')[1];

        if (submissionId) {
          this.resultEmitter.emit(submissionId, message);
        }
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.redisSubscriber.quit(),
      this.redisClient.quit(),
    ]);
  }

  async createSubmission(code: string): Promise<SubmissionCreatedResponse> {
    const submissionId = randomUUID();

    await this.redisClient.xAdd(this.submissionStreamKey, '*', {
      code,
      id: submissionId,
    });

    return {
      status: 'ok',
      submissionId,
    };
  }

  streamResult(submissionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let isClosed = false;
      let timeoutId: NodeJS.Timeout | undefined;
      let onResult: ((message: string) => void) | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        if (onResult) {
          this.resultEmitter.off(submissionId, onResult);
          onResult = undefined;
        }
      };

      const completeWith = (payload: SubmissionResultEvent) => {
        if (isClosed) {
          return;
        }

        cleanup();
        isClosed = true;
        subscriber.next({ data: payload });
        subscriber.complete();
      };

      void (async () => {
        try {
          onResult = (message: string) => {
            completeWith({
              status: 'completed',
              output: message,
            });
          };

          this.resultEmitter.once(submissionId, onResult);
          timeoutId = setTimeout(() => {
            completeWith({
              status: 'timeout',
              output: null,
            });
          }, this.resultTimeoutMs);

          const existing = await this.redisClient.get(
            this.getResultKey(submissionId),
          );

          if (isClosed) {
            return;
          }

          if (existing && existing !== this.processingStatus) {
            completeWith({
              status: 'completed',
              output: existing,
            });
            return;
          }

          subscriber.next({
            data: {
              status: 'pending',
              output: null,
            },
          });
        } catch (error) {
          cleanup();
          isClosed = true;
          subscriber.error(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })();

      return () => {
        cleanup();
        isClosed = true;
      };
    });
  }

  private getResultKey(submissionId: string): string {
    return `result:${submissionId}`;
  }
}
