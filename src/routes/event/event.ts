import express from "express";
import { createEvent, getEvents, updateEvent, deleteEvent } from "../../controller/event/eventController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateEvent, validateUpdateEvent } from "../../validation/event.js";

const router = express.Router();

// School events. Teachers can read them; only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateEvent, createEvent);
router.get("/", verifyAuthToken, requireStaff, getEvents);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateEvent, updateEvent);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteEvent);

export default router;
