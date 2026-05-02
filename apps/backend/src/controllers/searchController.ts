import type { Request, Response } from "express";
import { searchRepository } from "../repositories/searchRepository.js";
import { runSearch } from "../services/searchService.js";

export const searchController = {
  async create(req: Request, res: Response) {
    const { query } = req.body as { query?: string };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    await runSearch(query, res);
  },

  async list(_req: Request, res: Response) {
    const searches = await searchRepository.findAll();
    res.json(searches);
  },

  async getById(req: Request, res: Response) {
    const id = Number(req.params["id"]);
    const search = await searchRepository.findById(id);
    if (!search) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(search);
  },
};
