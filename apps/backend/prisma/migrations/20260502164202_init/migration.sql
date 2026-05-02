-- CreateTable
CREATE TABLE "Search" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "durationMs" INTEGER,
    "carsFound" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Car" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "searchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "year" INTEGER,
    "km" INTEGER,
    "priceOriginal" REAL,
    "currencyOriginal" TEXT,
    "priceUsd" REAL,
    "transmission" TEXT,
    "color" TEXT,
    "characteristics" TEXT,
    "link" TEXT NOT NULL,
    "savedAt" TEXT NOT NULL,
    CONSTRAINT "Car_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Car_searchId_idx" ON "Car"("searchId");

-- CreateIndex
CREATE UNIQUE INDEX "Car_searchId_link_key" ON "Car"("searchId", "link");
