import { db } from "../lib/db.js";

export interface CreateCarInput {
  searchId: number;
  name: string;
  model?: string | null;
  year?: number | null;
  km?: number | null;
  priceOriginal?: number | null;
  currencyOriginal?: string | null;
  priceUsd?: number | null;
  transmission?: string | null;
  color?: string | null;
  characteristics?: string | null;
  link: string;
}

export const carRepository = {
  async create(input: CreateCarInput) {
    return db.car.create({
      data: { ...input, savedAt: new Date().toISOString() },
    });
  },
};
