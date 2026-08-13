import { PrismaClient } from "@prisma/client"

/**
 * Singleton Prisma client.
 * En dev, Next.js recharge à chaud les modules — sans ce singleton on créerait
 * un nouveau client à chaque hot reload (= fuite de connexions).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
