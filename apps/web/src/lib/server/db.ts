import { PrismaClient } from "@prisma/client";
import { serverEnv } from "@/lib/server/serverEnv";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (serverEnv.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
