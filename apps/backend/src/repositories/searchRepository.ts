import { db } from "../lib/db.js";

export const searchRepository = {
  async create(query: string, sourceUrl: string) {
    return db.search.create({
      data: {
        query,
        sourceUrl,
        status: "running",
        createdAt: new Date().toISOString(),
        carsFound: 0,
      },
    });
  },

  async findAll() {
    return db.search.findMany({ orderBy: { id: "desc" } });
  },

  async findById(id: number) {
    return db.search.findUnique({ where: { id }, include: { cars: true } });
  },

  async markDone(id: number, durationMs: number) {
    const carsFound = await db.car.count({ where: { searchId: id } });
    return db.search.update({
      where: { id },
      data: { status: "done", durationMs, carsFound },
    });
  },

  async markFailed(id: number, reason: string, durationMs: number) {
    return db.search.update({
      where: { id },
      data: { status: "failed", failureReason: reason, durationMs },
    });
  },

  async markTimeout(id: number, durationMs: number) {
    return db.search.update({
      where: { id },
      data: { status: "timeout", durationMs },
    });
  },
};
