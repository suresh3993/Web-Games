-- AlterEnum
ALTER TYPE "GameEngine" ADD VALUE 'DOM';

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "max_score" INTEGER;

-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "preview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_game_stats" ADD COLUMN     "best_score_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "game_scores_game_id_created_at_idx" ON "game_scores"("game_id", "created_at");

