import { Module } from "@nestjs/common";
import { SchoolsController } from "./schools.controller.js";
import { SchoolsPublicController } from "./schools-public.controller.js";
import { SchoolsService } from "./schools.service.js";

@Module({
  controllers: [SchoolsController, SchoolsPublicController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
