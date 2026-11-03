import express from "express";
import { getDirectory, getMyInstituteWebsite, getMyWebsite, getPublicWebsite, getWebsiteByDomain, publishMyWebsite, saveMyWebsite } from "../../controller/website/websiteController.js";
import { verifyAuthToken, requireOwner } from "../../middleware/authMiddleware.js";
import { validatePublish, validateWebsite } from "../../validation/website.js";

const router = express.Router();

// Public website (no sign-in).
router.get("/public", getDirectory);
router.get("/public/domain", getWebsiteByDomain);
router.get("/public/:siteSlug", getPublicWebsite);

// The signed-in owner's own website.
router.get("/", verifyAuthToken, requireOwner, getMyWebsite);
router.put("/", verifyAuthToken, requireOwner, validateWebsite, saveMyWebsite);
router.patch("/publish", verifyAuthToken, requireOwner, validatePublish, publishMyWebsite);
// Teachers and students: their institute's website (read-only).
router.get("/institute", verifyAuthToken, getMyInstituteWebsite);

export default router;
