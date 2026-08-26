import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PROCESS_PAYOUT_QUEUE, PayoutsService } from './payouts.service';

@Processor(PROCESS_PAYOUT_QUEUE)
export class ProcessPayoutProcessor extends WorkerHost {
  constructor(private readonly payoutsService: PayoutsService) {
    super();
  }

  async process(job: Job<{ payoutId: string }>): Promise<void> {
    await this.payoutsService.process(job.data.payoutId);
  }
}
