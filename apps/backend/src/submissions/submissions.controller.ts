import {
  Body,
  Controller,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import {
  type SubmissionCreatedResponse,
  SubmissionsService,
} from './submissions.service';

@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  async create(
    @Body() body: CreateSubmissionDto,
  ): Promise<SubmissionCreatedResponse> {
    return this.submissionsService.createSubmission(body.code);
  }

  @Sse(':id/events')
  stream(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Observable<MessageEvent> {
    return this.submissionsService.streamResult(id);
  }
}
