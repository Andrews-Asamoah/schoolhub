import { Global, Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { R2Service } from "./r2.service.js";

@Global()
@Module({
  controllers: [AssetsController],
  providers: [R2Service, AssetsService],
  exports: [R2Service],
})
export class StorageModule {}
