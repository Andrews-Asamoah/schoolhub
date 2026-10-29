import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { DurableJobsService } from "./durable-jobs.service.js";

@Global()
@Module({ imports: [PrismaModule], providers: [DurableJobsService], exports: [DurableJobsService] })
export class JobsModule {}
