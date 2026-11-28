import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

const day = 24 * 60 * 60 * 1000;
const replayRetention = 30 * day;

@Injectable()
export class AttendanceReplayRetention
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AttendanceReplayRetention.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () =>
      void this.purge().catch(() =>
        this.logger.error('attendance.replay.retention.failed'),
      );
    this.timer = setInterval(run, day);
    this.timer.unref();
    run();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  purge(now = new Date()) {
    return this.prisma.client.attendanceBatchReplay.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - replayRetention) } },
    });
  }
}
