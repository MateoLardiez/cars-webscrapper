-- AlterTable
ALTER TABLE "Search" ADD COLUMN "cacheCreationTokens" INTEGER;
ALTER TABLE "Search" ADD COLUMN "cacheReadTokens" INTEGER;
ALTER TABLE "Search" ADD COLUMN "costUsd" REAL;
ALTER TABLE "Search" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "Search" ADD COLUMN "outputTokens" INTEGER;
