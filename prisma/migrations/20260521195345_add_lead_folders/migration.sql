-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "category" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceQuery" TEXT,
    "placeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "tags" TEXT,
    "lat" REAL,
    "lng" REAL,
    "imageUrl" TEXT,
    "description" TEXT,
    "price" TEXT,
    "permanentlyClosed" BOOLEAN DEFAULT false,
    "temporarilyClosed" BOOLEAN DEFAULT false,
    "instagram" TEXT,
    "facebook" TEXT,
    "linkedin" TEXT,
    "youtube" TEXT,
    "tiktok" TEXT,
    "twitter" TEXT,
    "pinterest" TEXT,
    "openingHours" TEXT,
    "webResults" TEXT,
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("address", "category", "city", "company", "country", "createdAt", "description", "email", "facebook", "id", "imageUrl", "instagram", "lat", "linkedin", "lng", "name", "notes", "openingHours", "permanentlyClosed", "phone", "pinterest", "placeId", "price", "rating", "reviewCount", "source", "sourceQuery", "status", "tags", "temporarilyClosed", "tiktok", "twitter", "updatedAt", "webResults", "website", "youtube") SELECT "address", "category", "city", "company", "country", "createdAt", "description", "email", "facebook", "id", "imageUrl", "instagram", "lat", "linkedin", "lng", "name", "notes", "openingHours", "permanentlyClosed", "phone", "pinterest", "placeId", "price", "rating", "reviewCount", "source", "sourceQuery", "status", "tags", "temporarilyClosed", "tiktok", "twitter", "updatedAt", "webResults", "website", "youtube" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_placeId_key" ON "Lead"("placeId");
CREATE INDEX "Lead_folderId_idx" ON "Lead"("folderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");
