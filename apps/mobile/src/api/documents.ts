import { z } from "zod";
import { defineDownload, defineEndpoint } from "./endpoint";

export const listStaffDocuments = defineEndpoint({
  method: "GET",
  path: "/documents",
  roles: ["teacher"],
  response: z.object({
    data: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        description: z.string().nullable(),
        fileType: z.string(),
        storageReady: z.boolean(),
      }),
    ),
    meta: z.object({
      page: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
    }),
  }),
});

export const shareStaffDocument = defineDownload({
  method: "GET",
  path: "/documents/:id/download",
  roles: ["teacher"],
});
