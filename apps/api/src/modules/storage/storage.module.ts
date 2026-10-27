import { Global, Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { R2Service } from "./r2.service.js";
import { STORAGE_HEALTH_PROBE } from "./storage-health.js";

@Global()
@Module({
  controllers: [AssetsController],
  providers: [
    R2Service,
    AssetsService,
    { provide: STORAGE_HEALTH_PROBE, useExisting: R2Service },
  ],
  exports: [R2Service, STORAGE_HEALTH_PROBE],
})
export class StorageModule {}
