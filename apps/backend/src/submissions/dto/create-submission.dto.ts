import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
