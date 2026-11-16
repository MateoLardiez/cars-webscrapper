import type { Request, Response } from "express";
import { searchRepository } from "../repositories/searchRepository.js";
import { runSearch } from "../services/searchService.js";
import { parseSearchRequest } from "../services/search/request.js";

export const searchController = {
  async create(req: Request, res: Response) {
    const parsed = parseSearchRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    await runSearch(parsed.filters, res);
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
