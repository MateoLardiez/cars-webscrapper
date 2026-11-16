import { Router } from "express";
import { getCatalog } from "../services/search/catalog.js";

export const catalogRouter = Router();

// Brands and models the search form offers
catalogRouter.get("/", (_req, res) => {
  res.json(getCatalog());
});
