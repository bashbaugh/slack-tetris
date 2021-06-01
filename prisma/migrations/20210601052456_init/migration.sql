-- CreateTable
CREATE TABLE "TwoPlayerGame" (
    "id" SERIAL NOT NULL,
    "offerTs" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "started" BOOLEAN,
    "winner" TEXT,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "user" TEXT NOT NULL,
    "betOn" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" SERIAL NOT NULL,
    "datetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Score.score_index" ON "Score"("score");

-- AddForeignKey
ALTER TABLE "Bet" ADD FOREIGN KEY ("gameId") REFERENCES "TwoPlayerGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
