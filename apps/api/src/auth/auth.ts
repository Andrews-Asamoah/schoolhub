import "../load-env.js";
import { prisma } from "../prisma/prisma.client.js";
import { createAuth } from "./auth.factory.js";

export const auth = createAuth(prisma);