import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
}

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return { status: 'ok' as const };
  }
}
