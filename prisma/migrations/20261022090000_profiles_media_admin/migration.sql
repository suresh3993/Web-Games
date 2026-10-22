-- AlterTable
ALTER TABLE "games" ADD COLUMN     "thumbnail_image_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_image_id" TEXT;

-- CreateTable
CREATE TABLE "media_images" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "image_id" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("image_id","width")
);

-- CreateIndex
CREATE INDEX "media_images_uploaded_by_id_idx" ON "media_images"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_sessions_user_id_ended_at_idx" ON "game_sessions"("user_id", "ended_at");

-- CreateIndex
CREATE INDEX "game_sessions_started_at_idx" ON "game_sessions"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "games_thumbnail_image_id_key" ON "games"("thumbnail_image_id");

-- CreateIndex
CREATE INDEX "user_achievements_achievement_id_idx" ON "user_achievements"("achievement_id");

-- CreateIndex
CREATE INDEX "user_challenge_progress_challenge_id_idx" ON "user_challenge_progress"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_image_id_key" ON "users"("avatar_image_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_image_id_fkey" FOREIGN KEY ("avatar_image_id") REFERENCES "media_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_thumbnail_image_id_fkey" FOREIGN KEY ("thumbnail_image_id") REFERENCES "media_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_images" ADD CONSTRAINT "media_images_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "media_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

