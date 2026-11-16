-- Store resized avatars in PostgreSQL instead of the server's local filesystem.
CREATE TABLE "AvatarFile" (
    "name" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "thumbnail" BYTEA NOT NULL,

    CONSTRAINT "AvatarFile_pkey" PRIMARY KEY ("name")
);
