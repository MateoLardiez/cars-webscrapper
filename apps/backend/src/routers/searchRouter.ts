import { Router } from "express";
import { searchController } from "../controllers/searchController.js";

export const searchRouter = Router();

searchRouter.post("/", searchController.create);
searchRouter.get("/", searchController.list);
searchRouter.get("/:id", searchController.getById);
