-- AlterTable
ALTER TABLE "PetGame" ALTER COLUMN "money" SET DEFAULT 80.0,
ALTER COLUMN "objectAssets" SET DEFAULT '[[2,[5,33]],[3,[1,33]]]',
ALTER COLUMN "petAssets" SET DEFAULT '[[["cat-1",["Pūkis",[["cat-1-1",0,true]]]]],[]]',
ALTER COLUMN "petStats" SET DEFAULT '{"cat-1":[1,1,1,0]}',
ALTER COLUMN "taxes" SET DEFAULT '[0,0]';
