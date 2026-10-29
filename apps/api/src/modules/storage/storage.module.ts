import { PrivateStorageService } from "./private-storage.service.js";
import { UploadValidationService } from "./upload-validation.service.js";
import { StorageCleanupService } from "./storage-cleanup.service.js";
import { Global, Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { R2Service } from "./r2.service.js";
import { PRIVATE_STORAGE_HEALTH_PROBE, STORAGE_HEALTH_PROBE } from "./storage-health.js";

@Global()
@Module({
  controllers: [AssetsController],
  providers: [
    R2Service, PrivateStorageService, UploadValidationService, StorageCleanupService,
    AssetsService,
    { provide: STORAGE_HEALTH_PROBE, useExisting: R2Service },
    { provide: PRIVATE_STORAGE_HEALTH_PROBE, useExisting: PrivateStorageService },
  ],
  exports: [R2Service, PrivateStorageService, UploadValidationService, StorageCleanupService, PRIVATE_STORAGE_HEALTH_PROBE, STORAGE_HEALTH_PROBE],
})
export class StorageModule {}
